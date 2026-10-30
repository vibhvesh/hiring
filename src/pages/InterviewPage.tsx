import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '../components/ui/button.tsx'
import { SHIPPED } from '../config/shipped.ts'
import type { HiringConfig, RoleProfile } from '../config/types.ts'
import { buildBundle } from '../lib/bundle.ts'
import {
  listCandidates,
  listRubrics,
  readDraft,
  readVideo,
  removeDraft,
  saveAlert,
  saveCandidate,
  saveDraft,
  saveResult,
  saveVideo,
} from '../lib/db.ts'
import { evaluateScreen } from '../lib/evaluate.ts'
import {
  createInterview,
  forceClose,
  receiveAnswer,
  type EngineState,
  type InterviewSeed,
} from '../lib/interview.ts'
import { decodePayload, sessionConfig, splitInterviewHash, type LinkPayload } from '../lib/link.ts'
import { modelStatus, prepareModel, rephraseLine } from '../lib/llm.ts'
import { sendReadyNotices } from '../lib/notify.ts'
import { openCamera, InterviewRecorder } from '../lib/recorder.ts'
import { listen, speakText, speechRecognitionSupported, unlockSpeech } from '../lib/speech.ts'
import { downloadBlob, formatClock, safeFileName, t } from '../lib/text.ts'
import { transcribeBlob } from '../lib/whisper.ts'
import { useWorkspace } from '../state/workspace.tsx'

interface Loaded {
  payload: LinkPayload
  config: HiringConfig
}

export function InterviewPage() {
  const params = useParams()
  const workspace = useWorkspace()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [missing, setMissing] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [live, setLive] = useState(false)
  const [done, setDone] = useState(false)
  const [partial, setPartial] = useState(false)
  const [bot, setBot] = useState('')
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(0)
  const [modelNote, setModelNote] = useState('')
  const [hasVideo, setHasVideo] = useState(false)
  const stateRef = useRef<EngineState | null>(null)
  const seedRef = useRef<InterviewSeed | null>(null)
  const configRef = useRef<HiringConfig>(SHIPPED)
  const cancelSpeak = useRef<(() => void) | null>(null)
  const stopListen = useRef<(() => void) | null>(null)
  const recorderRef = useRef<InterviewRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const finished = useRef(false)

  useEffect(() => {
    let cancel = false
    async function load() {
      const raw = params['*'] ?? ''
      const parts = splitInterviewHash(raw)
      if (parts.encoded) {
        const payload = decodePayload(parts.encoded)
        if (!payload) {
          setMissing(true)
          return
        }
        if (!cancel) setLoaded({ payload, config: payload.config })
        return
      }
      const people = await listCandidates()
      const person = people.find((item) => item.linkCode === parts.code)
      const history = await listRubrics()
      const rubric = history.find((item) => item.version === person?.rubricVersion)
      const role = person?.roleSnapshot ?? (await fallbackRole())
      if (!person || !role) {
        if (!cancel) setMissing(true)
        return
      }
      const payload: LinkPayload = {
        v: 1,
        id: person.id,
        code: person.linkCode,
        name: person.name,
        email: person.email,
        phone: person.phone,
        skills: person.skills,
        yearsExperience: person.yearsExperience,
        location: person.location,
        cvText: person.cvText,
        role,
        config: sessionConfig(rubric?.config ?? workspace.config, SHIPPED.copy),
      }
      if (!cancel) setLoaded({ payload, config: payload.config })
    }
    void load()
    return () => {
      cancel = true
    }
  }, [params, workspace.config])

  useEffect(() => {
    if (!live || !loaded) return
    const timer = window.setInterval(() => {
      const state = stateRef.current
      if (!state) return
      const left = state.startedAt + loaded.config.interview.durationLimitSeconds * 1000 - Date.now()
      setRemaining(left)
      if (left <= 0 && !finished.current) {
        const grace = loaded.config.interview.capMode === 'soft' ? loaded.config.interview.graceSeconds * 1000 : 0
        if (left + grace <= 0) void finish('time')
      }
    }, 400)
    return () => window.clearInterval(timer)
  }, [live, loaded])

  useEffect(() => {
    const onHide = () => {
      const state = stateRef.current
      const seed = seedRef.current
      if (!state || !seed || !loaded || finished.current || state.phase === 'done') return
      void saveDraft({
        candidateId: loaded.payload.id,
        state,
        seed,
        config: configRef.current,
        linkCode: loaded.payload.code,
        updatedAt: Date.now(),
      })
      const recorder = recorderRef.current
      if (recorder) {
        const blob = recorder.snapshot()
        void saveVideo({ candidateId: loaded.payload.id, parts: [blob], mime: recorder.mime, updatedAt: Date.now() })
      }
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [loaded])

  useEffect(() => {
    return () => {
      cancelSpeak.current?.()
      stopListen.current?.()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function begin(withCamera: boolean) {
    if (!loaded) return
    unlockSpeech()
    const config = loaded.config
    configRef.current = config
    const seed: InterviewSeed = {
      candidateName: loaded.payload.name,
      company: config.pdf.companyName,
      role: loaded.payload.role,
      cvText: loaded.payload.cvText,
      cvSkills: loaded.payload.skills,
    }
    seedRef.current = seed
    if (withCamera && config.recording.enabled) {
      try {
        const stream = await openCamera(config)
        streamRef.current = stream
        const recorder = new InterviewRecorder()
        await recorder.start(stream, config)
        recorderRef.current = recorder
        setHasVideo(stream.getVideoTracks().length > 0)
      } catch {
        if (config.recording.requireCamera) {
          setError(t(config, 'cameraFailed'))
          return
        }
        setError(t(config, 'cameraFailed'))
      }
    }
    const draft = await readDraft(loaded.payload.id)
    const opened = draft ? { state: draft.state, say: draft.state.turns.at(-1)?.text ?? '', done: draft.state.phase === 'done' } : createInterview(seed, config, Date.now())
    stateRef.current = opened.state
    setLive(true)
    setRemaining(config.interview.durationLimitSeconds * 1000)
    void prepareModel(config, setModelNote).then((next) => {
      setModelNote(next === 'ready' ? t(config, 'modelReady') : next === 'loading' ? t(config, 'modelLoading') : t(config, 'modelUnavailable'))
    })
    if (opened.done) {
      await finish('left')
      return
    }
    await say(opened.say ?? '', opened.state)
  }

  async function say(scripted: string, state: EngineState) {
    const config = configRef.current
    const seed = seedRef.current
    if (!seed) return
    const secondsLeft = (state.startedAt + config.interview.durationLimitSeconds * 1000 - Date.now()) / 1000
    const rewritten = await rephraseLine({
      scripted,
      config,
      phase: state.plan[state.index]?.kind ?? 'closing',
      secondsLeft,
      bot: config.persona.name,
      company: seed.company,
    })
    const spoken = rewritten ?? scripted
    if (rewritten) {
      state.mode = 'on-device'
      const last = state.turns.at(-1)
      if (last?.speaker === 'bot' && last.text === scripted) last.text = spoken
    }
    setBot(spoken)
    recorderRef.current?.setCaption(spoken)
    setStatus(t(config, 'speaking'))
    const speech = speakText(spoken, config)
    cancelSpeak.current = speech.cancel
    await speech.promise
    if (state.phase === 'done' || finished.current) return
    setStatus(speechRecognitionSupported() ? t(config, 'listening') : t(config, 'yourTurn'))
    stopListen.current?.()
    if (!speechRecognitionSupported() || !config.interview.allowTyping) return
    const handle = listen(config, {
      onPartial: setAnswer,
      onCommit: (text, confidence) => {
        if (text) void submit(text, 'speech', confidence)
        else setStatus(config.interview.silence.noSpeechPrompt)
      },
      onError: () => setStatus(config.interview.silence.noSpeechPrompt),
    })
    stopListen.current = handle?.stop ?? null
  }

  async function submit(text: string, source: 'speech' | 'typed', confidence: number | null) {
    const state = stateRef.current
    const seed = seedRef.current
    if (!state || !seed || finished.current) return
    stopListen.current?.()
    cancelSpeak.current?.()
    const step = receiveAnswer(state, { text, confidence, source, at: Date.now() }, configRef.current, seed)
    stateRef.current = step.state
    setAnswer('')
    if (loaded) {
      void saveDraft({
        candidateId: loaded.payload.id,
        state: step.state,
        seed,
        config: configRef.current,
        linkCode: loaded.payload.code,
        updatedAt: Date.now(),
      })
    }
    if (step.done) {
      await say(step.say ?? '', step.state)
      await finish(step.state.closedBecause === 'completed' ? 'completed' : step.state.closedBecause ?? 'left')
      return
    }
    if (step.say) await say(step.say, step.state)
  }

  async function finish(reason: 'completed' | 'time' | 'left') {
    if (finished.current || !loaded || !seedRef.current) return
    finished.current = true
    stopListen.current?.()
    let state = stateRef.current
    if (state && state.phase !== 'done') {
      const closed = forceClose(state, Date.now(), configRef.current, seedRef.current.candidateName, reason === 'completed' ? 'time' : reason)
      state = closed.state
      stateRef.current = state
      if (closed.say) setBot(closed.say)
    }
    if (!state) return
    let video: Blob | null = null
    if (recorderRef.current) {
      video = await recorderRef.current.stop()
      setHasVideo(video.size > 0)
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    const result = evaluateScreen({
      config: configRef.current,
      seed: seedRef.current,
      state,
      endedAt: Date.now(),
      recordingMime: video?.type || recorderRef.current?.mime || null,
    })
    result.candidateId = loaded.payload.id
    await saveResult(result)
    if (video && video.size > 0) {
      const previous = await readVideo(loaded.payload.id)
      await saveVideo({
        candidateId: loaded.payload.id,
        parts: [...(previous?.parts ?? []), video],
        mime: video.type || recorderRef.current?.mime || 'video/webm',
        updatedAt: Date.now(),
      })
    }
    const people = await listCandidates()
    const existing = people.find((item) => item.id === loaded.payload.id)
    await saveCandidate({
      id: loaded.payload.id,
      linkCode: loaded.payload.code,
      name: loaded.payload.name,
      email: loaded.payload.email,
      phone: loaded.payload.phone,
      fileName: existing?.fileName ?? '',
      cvText: loaded.payload.cvText,
      skills: loaded.payload.skills,
      yearsExperience: result.yearsExperience ?? loaded.payload.yearsExperience,
      location: result.location ?? loaded.payload.location,
      currentCtc: result.currentCtc,
      education: existing?.education ?? '',
      cvScore: existing?.cvScore ?? null,
      cvShortlisted: existing?.cvShortlisted ?? false,
      cvNotes: existing?.cvNotes ?? [],
      matchedSkills: existing?.matchedSkills ?? [],
      missingSkills: existing?.missingSkills ?? [],
      tailoredQuestions: existing?.tailoredQuestions ?? [],
      roleSnapshot: loaded.payload.role,
      status: result.partial ? 'partial' : 'complete',
      interviewScore: result.total,
      stars: result.stars,
      recommendationKey: result.recommendationKey,
      recommendationLabel: result.recommendationLabel,
      partial: result.partial,
      needsReview: result.lowConfidenceCount > 0,
      hasVideo: Boolean(video && video.size > 0) || Boolean(existing?.hasVideo),
      rubricVersion: result.rubricVersion,
      createdAt: existing?.createdAt ?? result.startedAt,
      updatedAt: Date.now(),
    })
    await removeDraft(loaded.payload.id)
    if (configRef.current.notifications.inDashboard) {
      await saveAlert({
        id: crypto.randomUUID(),
        candidateId: loaded.payload.id,
        title: configRef.current.notifications.dashboardAlertTitle,
        body: t(configRef.current, 'alertReady', { name: loaded.payload.name }),
        createdAt: Date.now(),
        read: false,
      })
    }
    void sendReadyNotices(configRef.current, {
      name: loaded.payload.name,
      role: loaded.payload.role.title,
      score: result.total,
      recommendation: result.recommendationLabel,
      summary: result.summary,
      transcript: result.transcript,
    })
    setPartial(result.partial)
    setDone(true)
    setLive(false)
    setStatus('')
  }

  async function downloadResult() {
    if (!loaded || !stateRef.current || !seedRef.current) return
    const { renderReport, loadPdfFonts } = await import('../lib/pdf.ts')
    const result = evaluateScreen({
      config: configRef.current,
      seed: seedRef.current,
      state: stateRef.current,
      endedAt: Date.now(),
      recordingMime: recorderRef.current?.mime ?? null,
    })
    result.candidateId = loaded.payload.id
    const fonts = await loadPdfFonts()
    const pdf = renderReport(
      {
        config: configRef.current,
        result,
        person: {
          name: loaded.payload.name,
          email: loaded.payload.email,
          phone: loaded.payload.phone,
          fileName: '',
          cvScore: null,
        },
        role: loaded.payload.role,
      },
      fonts,
    )
    const stored = await readVideo(loaded.payload.id)
    const video = stored ? new Blob(stored.parts, { type: stored.mime }) : null
    const bundle = await buildBundle({
      result,
      pdf: pdf.bytes,
      video,
      botName: configRef.current.persona.name,
    })
    downloadBlob(bundle, `${safeFileName(loaded.payload.name)}-result.zip`)
  }

  async function transcribeAnswer() {
    if (!streamRef.current) return
    const track = streamRef.current.getAudioTracks()[0]
    if (!track) return
    const recorder = new MediaRecorder(new MediaStream([track.clone()]))
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.start()
    await new Promise((resolve) => window.setTimeout(resolve, 4000))
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })
    const blob = new Blob(chunks, { type: recorder.mimeType })
    const text = await transcribeBlob(blob, configRef.current.interview.asr.whisperModel, setStatus)
    setAnswer(text)
  }

  if (missing) {
    return <p className="mx-auto max-w-xl px-5 py-16 text-2xl">This link does not look right. Ask the recruiter for the full link.</p>
  }
  if (!loaded) return <p className="px-5 py-16 text-xl">Loading…</p>
  const config = loaded.config
  if (done) {
    return (
      <section data-testid="done" className="mx-auto max-w-xl space-y-5 px-5 py-16">
        <h1 className="text-4xl font-bold">{t(config, 'thankYou', { name: loaded.payload.name })}</h1>
        {partial ? <p data-testid="partial-banner">{config.pdf.partialBanner}</p> : <p>{t(config, 'reportReady')}</p>}
        <p>{t(config, 'bundleHelp')}</p>
        {hasVideo ? <p data-testid="video-saved">{t(config, 'videoReady')}</p> : <p>{t(config, 'noVideo')}</p>}
        <Button type="button" data-testid="download-bundle" onClick={() => void downloadResult()}>{t(config, 'downloadBundle')}</Button>
        {config.storage.googleDrive.enabled && config.storage.googleDrive.clientId ? (
          <Button type="button" variant="secondary" onClick={() => void downloadResult()}>{t(config, 'uploadDrive')}</Button>
        ) : null}
        {modelNote ? <p className="text-muted">{modelNote}</p> : null}
      </section>
    )
  }
  if (!live) {
    return (
      <section className="mx-auto max-w-xl space-y-5 px-5 py-12">
        <p className="text-muted">{loaded.payload.role.title}</p>
        <h1 className="text-4xl font-bold">{config.privacy.consentTitle}</h1>
        <p className="text-xl">{config.privacy.consentBody}</p>
        <p className="text-muted">{config.recording.hint}</p>
        <label className="flex items-start gap-3 text-lg">
          <input data-testid="consent-check" className="mt-1 h-5 w-5" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>{config.privacy.consentCheckbox}</span>
        </label>
        <p className="text-muted">{config.privacy.consentDeclineText}</p>
        {error ? <p role="alert">{error}</p> : null}
        <Button type="button" data-testid="start-interview" disabled={!agreed} onClick={() => void begin(true)}>
          {t(config, 'startInterview')}
        </Button>
        {error && config.recording.allowContinueWithoutCamera ? (
          <Button type="button" variant="secondary" data-testid="continue-without-video" onClick={() => void begin(false)}>
            {t(config, 'continueWithoutVideo')}
          </Button>
        ) : null}
      </section>
    )
  }

  const warning = remaining > 0 && remaining <= config.interview.timeWarningSeconds * 1000
  return (
    <section className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <p>{loaded.payload.role.title}</p>
        <p data-testid="timer" className="text-3xl font-bold" aria-live="off">
          {remaining <= 0 ? t(config, 'finishingUp') : formatClock(remaining)}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, 100 - (remaining / (config.interview.durationLimitSeconds * 1000)) * 100))}%` }} />
      </div>
      {warning ? <p>{config.interview.timeWarningMessage}</p> : null}
      {modelNote ? <p className="text-muted">{modelNote || (modelStatus() === 'ready' ? t(config, 'modelReady') : '')}</p> : null}
      <p data-testid="bot-line" className="text-3xl leading-snug" aria-live="polite">{bot}</p>
      <p data-testid="listen-status">{status}</p>
      <label className="block">
        <span className="mb-2 block text-muted">{config.interview.typingHint}</span>
        <textarea data-testid="answer-input" value={answer} onChange={(event) => setAnswer(event.target.value)} className="field min-h-32" />
      </label>
      <Button type="button" data-testid="send-answer" disabled={!answer.trim()} onClick={() => void submit(answer, 'typed', null)}>
        {t(config, 'sendAnswer')}
      </Button>
      {!speechRecognitionSupported() && config.interview.asr.offerOfflineTranscription ? (
        <Button type="button" variant="secondary" onClick={() => void transcribeAnswer()}>{t(config, 'offlineTranscribe')}</Button>
      ) : null}
      <button type="button" data-testid="end-interview" className="text-left underline" onClick={() => void finish('left')}>
        {t(config, 'endInterview')}
      </button>
    </section>
  )
}

async function fallbackRole(): Promise<RoleProfile | null> {
  const { readMeta } = await import('../lib/db.ts')
  return readMeta<RoleProfile>('role')
}