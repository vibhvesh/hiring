import { useEffect, useState } from 'react'
import descriptions from '../../config/descriptions.json' with { type: 'json' }
import { Button } from '../components/ui/button.tsx'
import type { HiringConfig, MandatoryQuestion } from '../config/types.ts'
import { getPath, setPath, t } from '../lib/text.ts'
import { useWorkspace } from '../state/workspace.tsx'

const HELP = descriptions as Record<string, string>

interface FieldSpec {
  path: string
  label: string
  control: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'minutes' | 'lines'
  options?: string[]
  advanced?: boolean
}

const FIELDS: FieldSpec[] = [
  { path: 'interview.durationLimitSeconds', label: 'Interview length (minutes)', control: 'minutes' },
  { path: 'interview.capMode', label: 'When time is up', control: 'select', options: ['soft', 'hard'] },
  { path: 'interview.graceSeconds', label: 'Extra seconds after the limit', control: 'number' },
  { path: 'interview.openingGreeting', label: 'Opening greeting', control: 'textarea' },
  { path: 'interview.closingMessage', label: 'Closing message', control: 'textarea' },
  { path: 'interview.partialClosingMessage', label: 'Message if they leave early', control: 'textarea' },
  { path: 'interview.followUp.maxCount', label: 'Follow-up questions', control: 'number' },
  { path: 'interview.followUp.depth', label: 'Follow-up depth', control: 'select', options: ['light', 'medium', 'deep'] },
  { path: 'interview.followUp.tone', label: 'Follow-up tone', control: 'text' },
  { path: 'interview.candidateQuestions.allowed', label: 'Candidates may ask a question', control: 'boolean' },
  { path: 'interview.candidateQuestions.maxSeconds', label: 'Time kept for their question (seconds)', control: 'number' },
  { path: 'interview.candidateQuestions.prompt', label: 'How you invite their question', control: 'textarea' },
  { path: 'interview.voice.lang', label: 'Interview language', control: 'text' },
  { path: 'interview.voice.rate', label: 'Speech rate', control: 'number' },
  { path: 'interview.allowTyping', label: 'Candidates can type an answer', control: 'boolean' },
  { path: 'scoring.weights.technicalSkills', label: 'Weight: technical skills', control: 'number' },
  { path: 'scoring.weights.experience', label: 'Weight: experience', control: 'number' },
  { path: 'scoring.weights.communication', label: 'Weight: communication', control: 'number' },
  { path: 'scoring.weights.noticePeriod', label: 'Weight: notice period', control: 'number' },
  { path: 'scoring.weights.ctcFit', label: 'Weight: pay fit', control: 'number' },
  { path: 'scoring.weights.mandatoryQuestions', label: 'Weight: your questions', control: 'number' },
  { path: 'scoring.thresholds.shortlistMin', label: 'Shortlist from this score', control: 'number' },
  { path: 'scoring.thresholds.maybeMin', label: 'Maybe from this score', control: 'number' },
  { path: 'recommendations.shortlist.label', label: 'Shortlist label', control: 'text' },
  { path: 'recommendations.shortlist.color', label: 'Shortlist colour', control: 'text' },
  { path: 'recommendations.maybe.label', label: 'Maybe label', control: 'text' },
  { path: 'recommendations.maybe.color', label: 'Maybe colour', control: 'text' },
  { path: 'recommendations.reject.label', label: 'Reject label', control: 'text' },
  { path: 'recommendations.reject.color', label: 'Reject colour', control: 'text' },
  { path: 'recommendations.partial.label', label: 'Partial label', control: 'text' },
  { path: 'recommendations.partial.color', label: 'Partial colour', control: 'text' },
  { path: 'pdf.companyName', label: 'Company name on the report', control: 'text' },
  { path: 'pdf.footer', label: 'Report footer', control: 'textarea' },
  { path: 'pdf.accentColor', label: 'Report colour', control: 'text' },
  { path: 'privacy.retentionDays', label: 'Keep screens for this many days', control: 'number' },
  { path: 'privacy.autoPurge', label: 'Delete old screens automatically', control: 'boolean' },
  { path: 'privacy.consentTitle', label: 'Consent title', control: 'text' },
  { path: 'privacy.consentBody', label: 'Consent text', control: 'textarea' },
  { path: 'privacy.consentCheckbox', label: 'Consent checkbox', control: 'textarea' },
  { path: 'notifications.inDashboard', label: 'Show an alert when a screen is ready', control: 'boolean' },
  { path: 'notifications.mailto', label: 'Recruiter email', control: 'text' },
  { path: 'interview.silence.commitSilenceMs', label: 'Silence before an answer is taken (ms)', control: 'number', advanced: true },
  { path: 'interview.silence.maxRetries', label: 'Retries when nothing is heard', control: 'number', advanced: true },
  { path: 'interview.asr.lowConfidenceThreshold', label: 'Flag a line below this confidence', control: 'number', advanced: true },
  { path: 'interview.voice.pitch', label: 'Voice pitch', control: 'number', advanced: true },
  { path: 'interview.voice.preferredNames', label: 'Preferred voice names', control: 'lines', advanced: true },
  { path: 'interview.silence.retryPrompts', label: 'Retry prompts', control: 'lines', advanced: true },
  { path: 'persona.name', label: 'Bot name', control: 'text', advanced: true },
  { path: 'persona.tone', label: 'Bot tone', control: 'textarea', advanced: true },
  { path: 'persona.systemPrompt', label: 'On-device model instructions', control: 'textarea', advanced: true },
  { path: 'llm.enabled', label: 'Allow on-device phrasing', control: 'boolean', advanced: true },
  { path: 'llm.autoStart', label: 'Load the on-device model during a screen', control: 'boolean', advanced: true },
  { path: 'llm.modelId', label: 'On-device model', control: 'text', advanced: true },
  { path: 'llm.fallbackModelId', label: 'Smaller fallback model', control: 'text', advanced: true },
  { path: 'notifications.webhookUrl', label: 'Webhook address', control: 'text', advanced: true },
  { path: 'notifications.emailjs.enabled', label: 'Send a short EmailJS note', control: 'boolean', advanced: true },
  { path: 'notifications.emailjs.serviceId', label: 'EmailJS service id', control: 'text', advanced: true },
  { path: 'notifications.emailjs.templateId', label: 'EmailJS template id', control: 'text', advanced: true },
  { path: 'notifications.emailjs.publicKey', label: 'EmailJS public key', control: 'text', advanced: true },
  { path: 'storage.googleDrive.enabled', label: 'Offer Google Drive upload', control: 'boolean', advanced: true },
  { path: 'storage.googleDrive.clientId', label: 'Google Drive client id', control: 'text', advanced: true },
  { path: 'recording.videoBitsPerSecond', label: 'Video bitrate', control: 'number', advanced: true },
  { path: 'recording.audioBitsPerSecond', label: 'Audio bitrate', control: 'number', advanced: true },
  { path: 'recording.captionOnVideo', label: 'Write words on the video', control: 'boolean', advanced: true },
  { path: 'recording.mixBotVoice', label: 'Mix microphone into the video', control: 'boolean', advanced: true },
  { path: 'dashboard.pageSize', label: 'People per page', control: 'number', advanced: true },
  { path: 'privacy.abandonMinutes', label: 'Minutes before a left screen becomes partial', control: 'number', advanced: true },
  { path: 'links.shareMessage', label: 'Share message', control: 'textarea', advanced: true },
]

export function SettingsPage() {
  const { ready, config, saveConfig, resetConfig, rubrics, warnings } = useWorkspace()
  const [draft, setDraft] = useState<HiringConfig>(config)
  const [json, setJson] = useState(JSON.stringify(config, null, 2))
  const [jsonError, setJsonError] = useState('')
  const [saved, setSaved] = useState(false)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    if (!ready || synced) return
    setDraft(config)
    setJson(JSON.stringify(config, null, 2))
    setSynced(true)
  }, [config, ready, synced])

  if (!synced) return <p className="text-xl">Loading…</p>

  function update(path: string, value: unknown) {
    setDraft((current) => setPath(current, path, value))
    setSaved(false)
  }

  const main = FIELDS.filter((field) => !field.advanced)
  const advanced = FIELDS.filter((field) => field.advanced)

  return (
    <div data-testid="settings-page" className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold">{t(config, 'settingsTitle')}</h1>
        <p className="mt-2 text-muted">{t(config, 'settingsIntro')}</p>
        <p className="text-muted">{t(config, 'scoringVersion', { version: draft.version })}</p>
      </div>
      {warnings.length ? <p role="status">{warnings[0]}</p> : null}
      <section className="space-y-5">
        {main.map((field) => (
          <Editor key={field.path} field={field} draft={draft} onChange={update} />
        ))}
      </section>
      <QuestionEditor
        questions={draft.mandatoryQuestions}
        onChange={(questions) => update('mandatoryQuestions', questions)}
        title={t(config, 'mandatoryHeading')}
        help={t(config, 'mandatoryHelp')}
      />
      <p className="text-muted">{t(config, 'weightTotal')}</p>
      <Button
        type="button"
        data-testid="save-settings"
        onClick={() => {
          void saveConfig(draft).then((savedConfig) => {
            setDraft(savedConfig)
            setJson(JSON.stringify(savedConfig, null, 2))
            setSaved(true)
          })
        }}
      >
        {saved ? t(config, 'saved') ?? 'Saved' : t(config, 'saveSettings')}
      </Button>
      <details>
        <summary className="cursor-pointer text-lg">{t(config, 'moreOptions')}</summary>
        <div className="mt-5 space-y-5">
          {advanced.map((field) => (
            <Editor key={field.path} field={field} draft={draft} onChange={update} />
          ))}
          <label className="block">
            <span className="mb-1 block font-bold">Logo</span>
            <span className="mb-2 block text-muted">{HELP['pdf.logoDataUrl']}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => update('pdf.logoDataUrl', String(reader.result ?? ''))
                reader.readAsDataURL(file)
              }}
            />
          </label>
          <div>
            <h2 className="text-2xl font-bold">{t(config, 'rawJson')}</h2>
            <p className="text-muted">{t(config, 'rawJsonHelp')}</p>
            <textarea data-testid="raw-json" value={json} onChange={(event) => setJson(event.target.value)} className="field mt-3 min-h-64 font-mono text-sm" />
            {jsonError ? <p role="alert">{jsonError}</p> : null}
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() => {
                try {
                  const parsed = JSON.parse(json) as HiringConfig
                  setDraft(parsed)
                  setJsonError('')
                  void saveConfig(parsed)
                } catch {
                  setJsonError('That JSON could not be read.')
                }
              }}
            >
              Apply JSON
            </Button>
          </div>
          <Button type="button" variant="quiet" onClick={() => void resetConfig().then(() => setDraft(config))}>{t(config, 'resetSettings')}</Button>
          <section>
            <h2 className="text-2xl font-bold">{t(config, 'earlierRules')}</h2>
            <p className="text-muted">{t(config, 'earlierRulesHelp')}</p>
            <ul className="mt-2 space-y-1">
              {rubrics.map((rubric) => (
                <li key={rubric.version}>{rubric.version}</li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </div>
  )
}

function Editor({
  field,
  draft,
  onChange,
}: {
  field: FieldSpec
  draft: HiringConfig
  onChange: (path: string, value: unknown) => void
}) {
  const value = getPath(draft, field.path)
  const help = HELP[field.path] ?? ''
  if (field.control === 'boolean') {
    return (
      <label className="flex items-start gap-3">
        <input className="mt-1 h-5 w-5" type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(field.path, event.target.checked)} />
        <span>
          <span className="block font-bold">{field.label}</span>
          {help ? <span className="block text-muted">{help}</span> : null}
        </span>
      </label>
    )
  }
  if (field.control === 'minutes') {
    return (
      <label className="block">
        <span className="mb-1 block font-bold">{field.label}</span>
        <input
          data-testid="duration-minutes"
          className="field"
          type="number"
          min={1}
          value={Math.round(Number(value) / 60)}
          onChange={(event) => onChange(field.path, Number(event.target.value) * 60)}
        />
        {help ? <span className="mt-1 block text-muted">{help}</span> : null}
      </label>
    )
  }
  if (field.control === 'lines') {
    const lines = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join('\n') : ''
    return (
      <label className="block">
        <span className="mb-1 block font-bold">{field.label}</span>
        <textarea className="field min-h-28" value={lines} onChange={(event) => onChange(field.path, event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))} />
        {help ? <span className="mt-1 block text-muted">{help}</span> : null}
      </label>
    )
  }
  const control =
    field.control === 'textarea' ? (
      <textarea className="field min-h-28" value={String(value ?? '')} onChange={(event) => onChange(field.path, event.target.value)} />
    ) : field.control === 'select' ? (
      <select className="field" value={String(value ?? '')} onChange={(event) => onChange(field.path, event.target.value)}>
        {field.options?.map((option) => <option key={option}>{option}</option>)}
      </select>
    ) : (
      <input
        data-testid={field.path === 'scoring.thresholds.shortlistMin' ? 'shortlist-min' : undefined}
        className="field"
        type={field.control === 'number' ? 'number' : 'text'}
        value={value == null ? '' : String(value)}
        onChange={(event) => onChange(field.path, field.control === 'number' ? Number(event.target.value) : event.target.value)}
      />
    )
  return (
    <label className="block">
      <span className="mb-1 block font-bold">{field.label}</span>
      {control}
      {help ? <span className="mt-1 block text-muted">{help}</span> : null}
    </label>
  )
}

function QuestionEditor({
  questions,
  onChange,
  title,
  help,
}: {
  questions: MandatoryQuestion[]
  onChange: (questions: MandatoryQuestion[]) => void
  title: string
  help: string
}) {
  function move(index: number, direction: -1 | 1) {
    const next = [...questions]
    const target = index + direction
    const current = next[index]
    const swap = next[target]
    if (!current || !swap) return
    next[index] = swap
    next[target] = current
    onChange(next)
  }
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-muted">{help}</p>
      {questions.map((question, index) => (
        <div key={question.id} className="rounded-2xl bg-card p-4">
          {question.placeholder ? <p className="text-sm text-muted">Placeholder</p> : null}
          <textarea
            data-testid="mandatory-question"
            className="field min-h-24"
            value={question.prompt}
            onChange={(event) => {
              const next = [...questions]
              next[index] = { ...question, prompt: event.target.value, placeholder: /\[replace/i.test(event.target.value) }
              onChange(next)
            }}
          />
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" className="underline" onClick={() => move(index, -1)}>Move up</button>
            <button type="button" className="underline" onClick={() => move(index, 1)}>Move down</button>
            <button type="button" className="underline" onClick={() => onChange(questions.filter((_, item) => item !== index))}>Remove</button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          onChange([
            ...questions,
            { id: `question-${questions.length + 1}`, prompt: '[Replace this question] ', placeholder: true },
          ])
        }
      >
        Add a question
      </Button>
    </section>
  )
}