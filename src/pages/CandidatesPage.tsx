import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button.tsx'
import { SHIPPED } from '../config/shipped.ts'
import type { Candidate, RoleProfile } from '../config/types.ts'
import { zipNamed } from '../lib/bundle.ts'
import { loadPdfFonts, renderReport } from '../lib/pdf.ts'
import { paginate, queryCandidates, type CandidateFilter, type CandidateSort } from '../lib/query.ts'
import {
  copyText,
  encodePayload,
  interviewHref,
  mailShareUrl,
  sessionConfig,
  shareText,
  whatsAppUrl,
  type LinkPayload,
} from '../lib/link.ts'
import { safeFileName, t } from '../lib/text.ts'
import { useWorkspace } from '../state/workspace.tsx'
import { writeMeta, listResults, readVideo } from '../lib/db.ts'

export function CandidatesPage() {
  const workspace = useWorkspace()
  const { config, role, candidates, alerts, ready } = workspace
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CandidateFilter>(config.dashboard.defaultFilter)
  const [sort, setSort] = useState<CandidateSort>(config.dashboard.defaultSort)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmExample, setConfirmExample] = useState(false)

  const filtered = useMemo(
    () => queryCandidates(candidates, { q: query, filter, sort }),
    [candidates, filter, query, sort],
  )
  const view = paginate(filtered, page, config.dashboard.pageSize)
  const placeholders = config.mandatoryQuestions.some((question) => question.placeholder)

  async function onFiles(list: FileList | null) {
    if (!list?.length) return
    setBusy(true)
    const failures = await workspace.addFiles([...list])
    setBusy(false)
    setMessage(failures.length ? failures.map((name) => t(config, 'parseFailed', { name })).join(' ') : '')
  }

  async function downloadSelected() {
    setBusy(true)
    const fonts = await loadPdfFonts()
    const results = await listResults()
    const files: { name: string; data: Blob | Uint8Array }[] = []
    for (const id of selected) {
      const person = candidates.find((item) => item.id === id)
      const result = results.find((item) => item.candidateId === id)
      if (!person || !result) continue
      const report = renderReport(
        {
          config,
          result,
          person,
          role: person.roleSnapshot ?? role ?? emptyRole(),
        },
        fonts,
      )
      const folder = safeFileName(person.name, person.id)
      files.push({ name: `${folder}/report.pdf`, data: report.bytes })
      const video = await readVideo(id)
      const blob = video ? new Blob(video.parts, { type: video.mime }) : null
      if (blob && blob.size > 0) files.push({ name: `${folder}/recording.${video?.mime.includes('mp4') ? 'mp4' : 'webm'}`, data: blob })
    }
    if (files.length) {
      const zip = await zipNamed(files)
      const url = URL.createObjectURL(zip)
      const link = document.createElement('a')
      link.href = url
      link.download = 'hiring-selected.zip'
      link.click()
      URL.revokeObjectURL(url)
    }
    setBusy(false)
  }

  async function exportBackup() {
    const backup = {
      kind: 'hiring-backup',
      exportedAt: Date.now(),
      config,
      rubrics: workspace.rubrics,
      role,
      candidates,
      results: await listResults(),
      alerts,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'hiring-backup.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importBackup(file: File | undefined) {
    if (!file) return
    if (file.name.endsWith('.zip')) {
      const { readBundle } = await import('../lib/bundle.ts')
      const { saveResult, saveVideo, saveCandidate } = await import('../lib/db.ts')
      const bundle = await readBundle(file)
      const id = bundle.result.candidateId || crypto.randomUUID()
      bundle.result.candidateId = id
      await saveResult(bundle.result)
      if (bundle.video) await saveVideo({ candidateId: id, parts: [bundle.video], mime: bundle.video.type, updatedAt: Date.now() })
      const existing = candidates.find((item) => item.id === id)
      await saveCandidate({
        ...(existing ?? {
          id,
          linkCode: id.slice(0, 8),
          name: bundle.result.candidateName,
          email: '',
          phone: '',
          fileName: '',
          cvText: '',
          skills: bundle.result.skills,
          yearsExperience: bundle.result.yearsExperience,
          location: bundle.result.location ?? '',
          currentCtc: bundle.result.currentCtc,
          education: '',
          cvScore: null,
          cvShortlisted: false,
          cvNotes: [],
          matchedSkills: [],
          missingSkills: [],
          tailoredQuestions: [],
          roleSnapshot: role,
          createdAt: Date.now(),
          hasVideo: false,
          rubricVersion: bundle.result.rubricVersion,
        }),
        name: bundle.result.candidateName,
        status: bundle.result.partial ? 'partial' : 'complete',
        interviewScore: bundle.result.total,
        stars: bundle.result.stars,
        recommendationKey: bundle.result.recommendationKey,
        recommendationLabel: bundle.result.recommendationLabel,
        partial: bundle.result.partial,
        needsReview: bundle.result.lowConfidenceCount > 0,
        hasVideo: Boolean(bundle.video),
        updatedAt: Date.now(),
      })
      await workspace.refresh()
      setMessage(t(config, 'importDone'))
      return
    }
    const parsed = JSON.parse(await file.text()) as {
      kind?: string
      config?: unknown
      role?: RoleProfile | null
      candidates?: Candidate[]
      results?: { candidateId: string }[]
    }
    if (parsed.kind !== 'hiring-backup') {
      setMessage('That file is not a Hiring backup.')
      return
    }
    const { saveRubric } = await import('../lib/db.ts')
    const { applyConfig } = await import('../config/apply.ts')
    const next = parsed.config ? applyConfig(parsed.config).config : config
    await writeMeta('config', next)
    await writeMeta('role', parsed.role ?? null)
    await saveRubric({ version: next.version, savedAt: Date.now(), config: next })
    const { replaceWorkspace } = await import('../lib/db.ts')
    await replaceWorkspace({
      config: next,
      role: parsed.role ?? null,
      candidates: parsed.candidates ?? [],
      results: (parsed.results ?? []) as never,
    })
    await workspace.refresh()
    setMessage(t(config, 'importDone'))
  }

  if (!ready) return <p className="text-xl">Loading…</p>
  if (!role) return <RoleForm />

  return (
    <div data-testid="candidates-page" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">{t(config, 'candidatesTitle')}</h1>
          <p className="mt-2 text-muted">{t(config, 'candidatesIntro', { role: role.title })}</p>
          <p className="mt-1 text-muted">{t(config, 'scoringVersion', { version: config.version })}</p>
        </div>
        <div>
          <input id="cv-upload" data-testid="add-cvs" className="sr-only" type="file" multiple accept=".pdf,.docx,.txt,.md,.text" onChange={(event) => void onFiles(event.target.files)} />
          <Button type="button" disabled={busy} onClick={() => document.getElementById('cv-upload')?.click()}>
            {busy ? 'Reading…' : t(config, 'addCvs')}
          </Button>
        </div>
      </div>
      {placeholders ? <p className="rounded-2xl bg-soft px-4 py-3">{t(config, 'placeholderBanner')}</p> : null}
      {alerts.map((alert) => (
        <p key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3">
          <span>{alert.body}</span>
          <button type="button" className="underline" onClick={() => void workspace.dismissAlert(alert.id)}>{t(config, 'dismiss')}</button>
        </p>
      ))}
      {message ? <p role="status">{message}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-muted">{t(config, 'searchPlaceholder')}</span>
          <input data-testid="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} className="w-full rounded-xl border border-line bg-card px-3 py-3" placeholder={t(config, 'searchPlaceholder')} />
        </label>
        <label className="block">
          <span className="mb-1 block text-muted">{t(config, 'filters')}</span>
          <select data-testid="filter" value={filter} onChange={(event) => { setFilter(event.target.value as CandidateFilter); setPage(1) }} className="w-full rounded-xl border border-line bg-card px-3 py-3">
            {(['all', 'shortlist', 'maybe', 'reject', 'partial', 'review', 'unscreened'] as const).map((item) => (
              <option key={item} value={item}>{t(config, filterKey(item))}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-muted">{t(config, 'sort')}</span>
          <select data-testid="sort" value={sort} onChange={(event) => setSort(event.target.value as CandidateSort)} className="w-full rounded-xl border border-line bg-card px-3 py-3">
            <option value="newest">{t(config, 'sortNewest')}</option>
            <option value="score">{t(config, 'sortScore')}</option>
            <option value="name">{t(config, 'sortName')}</option>
          </select>
        </label>
      </div>
      {selected.length ? (
        <div className="flex flex-wrap items-center gap-3">
          <span>{t(config, 'selected', { count: selected.length })}</span>
          <Button type="button" onClick={() => void downloadSelected()} disabled={busy}>{t(config, 'bulkDownload')}</Button>
          <Button type="button" variant="secondary" onClick={() => void workspace.deleteCandidates(selected).then(() => setSelected([]))}>{t(config, 'deleteSelected')}</Button>
          <Button type="button" variant="quiet" onClick={() => setSelected([])}>{t(config, 'clearSelection')}</Button>
        </div>
      ) : null}
      {view.items.length === 0 ? <p className="text-xl">{t(config, 'emptyCandidates')}</p> : null}
      <ul className="space-y-4">
        {view.items.map((person) => (
          <li key={person.id} data-testid="candidate-card" className="rounded-3xl bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <label className="flex items-start gap-3">
                <input
                  data-testid="select-candidate"
                  type="checkbox"
                  className="mt-2 h-5 w-5"
                  checked={selected.includes(person.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id),
                    )
                  }
                />
                <span>
                  <span data-testid="candidate-name" className="block text-2xl font-bold">{person.name}</span>
                  <span className="mt-1 block text-muted">
                    {person.interviewScore == null
                      ? person.cvScore == null
                        ? t(config, 'notScreened')
                        : t(config, 'cvMatch', { score: person.cvScore })
                      : t(config, 'outOf', { score: person.interviewScore })}
                    {person.recommendationLabel ? ` · ${person.recommendationLabel}` : ''}
                    {person.partial && person.recommendationKey !== 'partial' ? ` · ${t(config, 'partial')}` : ''}
                    {person.needsReview ? ` · ${t(config, 'needsReview')}` : ''}
                  </span>
                  {person.stars != null ? <Stars value={person.stars} /> : null}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {person.interviewScore != null ? (
                  <Link to={`/candidate/${person.id}`} className="inline-flex min-h-12 items-center rounded-xl bg-accent px-4 font-bold text-white" data-testid="open-report">
                    {t(config, 'openReport')}
                  </Link>
                ) : (
                  <CopyLink person={person} primary />
                )}
              </div>
            </div>
            <details data-testid="more-options" className="mt-4">
              <summary className="cursor-pointer text-lg">{t(config, 'moreOptions')}</summary>
              <div className="mt-3 flex flex-wrap gap-3">
                {person.interviewScore != null ? <CopyLink person={person} /> : null}
                {person.hasVideo || person.interviewScore != null ? (
                  <Link to={`/candidate/${person.id}?watch=1`} className="underline">{t(config, 'watchVideo')}</Link>
                ) : null}
                <button type="button" className="underline" onClick={() => void workspace.deleteCandidates([person.id])}>{t(config, 'delete')}</button>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <p>{t(config, 'showing', { from: view.from, to: view.to, total: filtered.length })}</p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>{t(config, 'previous')}</Button>
          <Button type="button" variant="secondary" disabled={view.page >= view.pages} onClick={() => setPage(view.page + 1)}>{t(config, 'next')}</Button>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-lg">{t(config, 'moreOptions')}</summary>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={() => void exportBackup()}>{t(config, 'exportJson')}</Button>
          <label className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border border-line bg-card px-4 font-bold">
            {t(config, 'importJson')}
            <input data-testid="import-backup" className="sr-only" type="file" accept=".json,.zip" onChange={(event) => void importBackup(event.target.files?.[0])} />
          </label>
          <Button type="button" variant="secondary" data-testid="load-example" onClick={() => (candidates.length && !confirmExample ? setConfirmExample(true) : void workspace.loadExample())}>
            {confirmExample ? t(config, 'replaceExample') : t(config, 'loadExample')}
          </Button>
          <Button type="button" variant="quiet" onClick={() => void workspace.purgeNow().then((count) => setMessage(count ? t(config, 'purged', { count }) : t(config, 'nothingToPurge')))}>{t(config, 'purgeNow')}</Button>
          <EditRole />
        </div>
        {confirmExample ? <p className="mt-3">{t(config, 'exampleConfirm')}</p> : null}
      </details>
      <p className="text-muted">{t(config, 'savedOnDevice')}</p>
      <span className="sr-only">{SHIPPED.version}</span>
    </div>
  )
}

function CopyLink({ person, primary = false }: { person: Candidate; primary?: boolean }) {
  const { config, role, markInvited } = useWorkspace()
  const [copied, setCopied] = useState(false)
  const url = linkFor(person, config, role)
  const text = shareText(config, person.name, person.roleSnapshot?.title || role?.title || '')
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        data-testid="copy-link"
        className={primary ? 'inline-flex min-h-12 items-center rounded-xl bg-accent px-4 font-bold text-white' : 'underline'}
        onClick={() => {
          void copyText(url).then(() => {
            setCopied(true)
            void markInvited(person.id)
          })
        }}
      >
        {copied ? t(config, 'copied') : t(config, 'copyLink')}
      </button>
      <a className="underline" href={whatsAppUrl(text, url)} target="_blank" rel="noreferrer">{t(config, 'shareWhatsApp')}</a>
      <a className="underline" href={mailShareUrl(config.notifications.mailto, `Interview for ${person.name}`, `${text}\n${url}`)}>{t(config, 'shareEmail')}</a>
      {'share' in navigator ? (
        <button type="button" className="underline" onClick={() => void navigator.share({ title: 'Interview', text, url })}>{t(config, 'share')}</button>
      ) : null}
      <span className="sr-only" data-testid="interview-url" data-url={url} />
    </span>
  )
}

function linkFor(person: Candidate, config: ReturnType<typeof useWorkspace>['config'], role: RoleProfile | null): string {
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
    role: person.roleSnapshot ?? role ?? emptyRole(),
    config: sessionConfig(config, SHIPPED.copy),
  }
  return interviewHref(window.location.origin, window.location.pathname, person.linkCode, encodePayload(payload))
}

function Stars({ value }: { value: number }) {
  return (
    <span className="mt-2 flex gap-1" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= value ? 'text-accent' : 'text-line'}>●</span>
      ))}
    </span>
  )
}

function filterKey(filter: CandidateFilter): string {
  if (filter === 'all') return 'filterAll'
  if (filter === 'shortlist') return 'filterShortlist'
  if (filter === 'maybe') return 'filterMaybe'
  if (filter === 'reject') return 'filterReject'
  if (filter === 'partial') return 'filterPartial'
  if (filter === 'review') return 'filterReview'
  return 'filterNotScreened'
}

function emptyRole(): RoleProfile {
  return {
    id: 'role',
    title: '',
    requiredSkills: [],
    niceToHaveSkills: [],
    minYears: 0,
    location: '',
    remoteOk: false,
    currency: 'INR',
    budgetMin: null,
    budgetMax: null,
    description: '',
    updatedAt: 0,
  }
}

function RoleForm() {
  const { config, saveRole, loadExample } = useWorkspace()
  const [title, setTitle] = useState('')
  const [skills, setSkills] = useState('')
  const [years, setYears] = useState(String(config.roleForm.defaultMinYears))
  const [location, setLocation] = useState('')
  const [remote, setRemote] = useState(false)
  const [currency, setCurrency] = useState(config.roleForm.defaultCurrency)
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [description, setDescription] = useState('')

  return (
    <form
      data-testid="role-form"
      className="mx-auto max-w-2xl space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        void saveRole({
          id: crypto.randomUUID(),
          title: title.trim(),
          requiredSkills: skills.split(/[,;\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean),
          niceToHaveSkills: [],
          minYears: Number(years) || 0,
          location: location.trim(),
          remoteOk: remote,
          currency,
          budgetMin: budgetMin === '' ? null : Number(budgetMin),
          budgetMax: budgetMax === '' ? null : Number(budgetMax),
          description: description.trim(),
          updatedAt: Date.now(),
        })
      }}
    >
      <h1 className="text-4xl font-bold">{t(config, 'roleEmptyTitle')}</h1>
      <p className="text-xl text-muted">{t(config, 'roleEmptyBody')}</p>
      <Field label={t(config, 'roleLabel')}><input data-testid="role-title" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={config.roleForm.titlePlaceholder} className="field" /></Field>
      <Field label={t(config, 'requiredSkills')} help={config.roleForm.skillsHelp}><input data-testid="role-skills" required value={skills} onChange={(event) => setSkills(event.target.value)} placeholder={config.roleForm.skillsPlaceholder} className="field" /></Field>
      <Field label={t(config, 'minYears')}><input data-testid="role-years" type="number" min={0} value={years} onChange={(event) => setYears(event.target.value)} className="field" /></Field>
      <Field label={t(config, 'location')}><input data-testid="role-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder={config.roleForm.locationPlaceholder} className="field" /></Field>
      <label className="flex items-center gap-3 text-lg"><input type="checkbox" checked={remote} onChange={(event) => setRemote(event.target.checked)} /> {config.roleForm.remoteLabel}</label>
      <Field label={t(config, 'currency')}>
        <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="field">
          {config.roleForm.currencies.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Budget from" help={config.roleForm.budgetHelp}><input data-testid="role-budget-min" type="number" value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} className="field" /></Field>
        <Field label="Budget to"><input data-testid="role-budget-max" type="number" value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} className="field" /></Field>
      </div>
      <Field label={t(config, 'description')}><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="field min-h-28" /></Field>
      <Button type="submit" data-testid="save-role">{t(config, 'saveRole')}</Button>
      <Button type="button" variant="quiet" data-testid="load-example" onClick={() => void loadExample()}>{t(config, 'loadExample')}</Button>
    </form>
  )
}

function EditRole() {
  const { role, config } = useWorkspace()
  const [open, setOpen] = useState(false)
  if (!role) return null
  if (!open) return <Button type="button" variant="quiet" onClick={() => setOpen(true)}>{t(config, 'editRole')}</Button>
  return <RoleEditor role={role} onClose={() => setOpen(false)} />
}

function RoleEditor({ role, onClose }: { role: RoleProfile; onClose: () => void }) {
  const { config, saveRole } = useWorkspace()
  const [title, setTitle] = useState(role.title)
  const [skills, setSkills] = useState(role.requiredSkills.join(', '))
  const [years, setYears] = useState(String(role.minYears))
  const [location, setLocation] = useState(role.location)
  const [budgetMin, setBudgetMin] = useState(role.budgetMin == null ? '' : String(role.budgetMin))
  const [budgetMax, setBudgetMax] = useState(role.budgetMax == null ? '' : String(role.budgetMax))
  return (
    <form className="mt-4 space-y-3" onSubmit={(event) => {
      event.preventDefault()
      void saveRole({
        ...role,
        title,
        requiredSkills: skills.split(/[,;\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean),
        minYears: Number(years) || 0,
        location,
        budgetMin: budgetMin === '' ? null : Number(budgetMin),
        budgetMax: budgetMax === '' ? null : Number(budgetMax),
        updatedAt: Date.now(),
      }).then(onClose)
    }}>
      <input data-testid="role-title" value={title} onChange={(event) => setTitle(event.target.value)} className="field" />
      <input data-testid="role-skills" value={skills} onChange={(event) => setSkills(event.target.value)} className="field" />
      <input data-testid="role-years" value={years} onChange={(event) => setYears(event.target.value)} className="field" />
      <input data-testid="role-location" value={location} onChange={(event) => setLocation(event.target.value)} className="field" />
      <input data-testid="role-budget-min" value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} className="field" />
      <input data-testid="role-budget-max" value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} className="field" />
      <Button type="submit">{t(config, 'saveRole')}</Button>
    </form>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block text-lg">
      <span className="mb-1 block font-bold">{label}</span>
      {children}
      {help ? <span className="mt-1 block text-base text-muted">{help}</span> : null}
    </label>
  )
}