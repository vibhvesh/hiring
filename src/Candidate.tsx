import { useEffect, useMemo, useRef, useState } from 'react'
import { config } from './config.ts'
import { extractFacts, type Facts } from './extract.ts'
import { Interview, type Result } from './interview.ts'
import { decodeInvite } from './link.ts'
import { llmFacts, warmUpLLM } from './llm.ts'
import { startRecording, type Recording } from './recorder.ts'
import { download, makeZip, zipName } from './report.ts'
import SamplePicker from './SamplePicker.tsx'
import { canListen, listen, speak, unlockSpeech, type Listener } from './speech.ts'

const TEST = new URLSearchParams(location.search).has('test') // used by automated tests: no voice, mic or camera
const LIMIT = config.maxMinutes * 60_000
const partialKey = (id: string) => `hiring.partial.${id}`

export default function Candidate({ code }: { code: string }) {
  const invite = useMemo(() => decodeInvite(code), [code])
  const [stage, setStage] = useState<'start' | 'live' | 'saving' | 'done'>('start')
  const [name, setName] = useState('')
  const [resume, setResume] = useState<Facts | null>(null)
  const [aiText, setAiText] = useState('')
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [micNote, setMicNote] = useState('')
  const [left, setLeft] = useState(LIMIT)
  const [zip, setZip] = useState<{ blob: Blob; name: string } | null>(null)
  const [earlier] = useState<Result | null>(() => { try { return invite ? JSON.parse(localStorage.getItem(partialKey(invite.id)) ?? 'null') : null } catch { return null } })

  const iv = useRef<Interview | null>(null)
  const rec = useRef<Recording | null>(null)
  const ear = useRef<Listener | null>(null)
  const conf = useRef<number | null>(null)
  const silence = useRef<number>(0)
  const t0 = useRef(0)
  const videoEl = useRef<HTMLVideoElement>(null)
  const draftRef = useRef('')
  const busy = useRef(false)

  const elapsed = () => Date.now() - t0.current
  const setD = (t: string) => { draftRef.current = t; setDraft(t) }

  // keep a partial result if the candidate closes the tab mid-interview
  useEffect(() => {
    const save = () => { const i = iv.current; if (i && !i.done && invite) { i.finish('left', elapsed()); localStorage.setItem(partialKey(invite.id), JSON.stringify(i.result(elapsed()))) } }
    addEventListener('pagehide', save)
    return () => removeEventListener('pagehide', save)
  }, [invite])

  useEffect(() => {
    if (stage !== 'live') return
    const t = setInterval(() => {
      setLeft(Math.max(0, LIMIT - elapsed()))
      if (elapsed() > LIMIT + 30_000 && !busy.current) submit(draftRef.current || '(no answer, time ran out)', false)
    }, 500)
    return () => clearInterval(t)
  })

  if (!invite) return <div className="page narrowpage"><main className="card"><h2>This link doesn't work</h2><p>It may have been cut off when copied. Please ask the recruiter to send it again.</p></main></div>

  const stopEar = () => { ear.current?.stop(); ear.current = null; setListening(false); clearTimeout(silence.current) }

  async function turn() {
    const i = iv.current!
    setAiText(i.prompt)
    setD('')
    conf.current = null
    setSpeaking(true)
    await speak(i.prompt, !TEST).done
    setSpeaking(false)
    busy.current = false
    if (i.done) return finish()
    if (!TEST && canListen() && !micNote) {
      ear.current = listen((text, c) => {
        setD(text)
        conf.current = c
        clearTimeout(silence.current)
        silence.current = window.setTimeout(() => submit(draftRef.current, false), config.silenceSeconds * 1000)
      }, (m) => { setMicNote(m); stopEar() })
      setListening(!!ear.current)
    }
  }

  async function submit(text: string, typed: boolean) {
    const i = iv.current
    if (!i || i.done || busy.current || !text.trim()) return
    busy.current = true
    stopEar()
    if ((i.phase === 'intro' || i.phase === 'retry') && config.useWebLLM) {
      const h = await llmFacts(text)
      if (h) i.hint(h)
    }
    i.answer(text, { confidence: typed ? null : conf.current, typed }, elapsed())
    turn()
  }

  async function begin() {
    unlockSpeech()
    warmUpLLM()
    setStage('live')
    rec.current = TEST ? null : await startRecording()
    if (rec.current?.hasVideo && videoEl.current) { videoEl.current.srcObject = rec.current.stream; videoEl.current.dataset.on = '1' }
    if (!TEST && !canListen()) setMicNote("Voice answers aren't supported in this browser. Please type your answers.")
    t0.current = Date.now()
    iv.current = new Interview(invite!.profile, invite!.id, name.trim(), resume)
    turn()
  }

  async function finish() {
    stopEar()
    setStage('saving')
    const i = iv.current!
    const result = i.result(elapsed())
    const video = rec.current ? await rec.current.stop() : null
    const blob = await makeZip(result, video)
    localStorage.removeItem(partialKey(invite!.id))
    setZip({ blob, name: zipName(result) })
    setStage('done')
  }

  const endEarly = () => { if (confirm('End the interview now? Your answers so far will be saved.')) { iv.current?.finish('ended', elapsed()); finish() } }

  if (stage === 'start') {
    return (
      <div className="page narrowpage">
        <main className="card">
          <p className="muted small">Interview for</p>
          <h1>{invite.profile.role}</h1>
          <p>A friendly 5-minute chat with an AI recruiter. It will speak to you and listen to your answers. You can also type.</p>
          <label>Your name <span className="muted small">(optional)</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <details>
            <summary>Add your resume (optional)</summary>
            <SamplePicker kind="resume" label="Upload resume" onText={(t) => setResume(extractFacts(t))} />
            {resume && <p className="muted small">Got it. It only helps if something is unclear.</p>}
          </details>
          <button className="primary big" onClick={begin}>Start interview</button>
          <p className="muted small">Your browser will ask to use your microphone and camera. The interview is recorded, and stays on your device until you send the results file to the recruiter.</p>
          {earlier && (
            <p className="warn">Your last attempt on this link stopped early. <button className="link" onClick={async () => download(await makeZip(earlier, null), zipName(earlier))}>Download those partial results</button></p>
          )}
        </main>
      </div>
    )
  }

  if (stage === 'saving') return <div className="page narrowpage"><main className="card"><h2>Preparing your results…</h2></main></div>

  if (stage === 'done') {
    return (
      <div className="page narrowpage">
        <main className="card">
          <h2>Thank you{name ? `, ${name}` : ''}!</h2>
          <p>That's the end of the interview. Please download your results file and send it to the recruiter (email or chat).</p>
          <button className="primary big" onClick={() => zip && download(zip.blob, zip.name)}>Download results (.zip)</button>
          <p className="muted small">{zip?.name}</p>
        </main>
      </div>
    )
  }

  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000)
  return (
    <div className="page narrowpage live">
      <div className="bar"><span>{invite.profile.role}</span><span className="mono" aria-label="Time left">{mm}:{String(ss).padStart(2, '0')}</span></div>
      <video ref={videoEl} className="selfie" autoPlay muted playsInline />
      <main className="card">
        <p className={`ai ${speaking ? 'pulse' : ''}`} data-testid="ai">{aiText}</p>
        <p className="muted small">{speaking ? 'Speaking…' : listening ? 'Listening… pause when you are done, or press Send.' : 'Type your answer below.'}</p>
        {micNote && <p className="warn">{micNote}</p>}
        <textarea value={draft} onChange={(e) => { stopEar(); setD(e.target.value) }} placeholder="Your answer" rows={4} aria-label="Your answer"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(draft, !listening) } }} />
        <div className="row between">
          <button className="quiet" onClick={endEarly}>End interview</button>
          <button className="primary" disabled={speaking || !draft.trim()} onClick={() => submit(draft, !listening && conf.current == null)}>Send</button>
        </div>
      </main>
    </div>
  )
}
