import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button.tsx'
import type { Candidate, ScreenResult } from '../config/types.ts'
import { buildBundle } from '../lib/bundle.ts'
import { readResult, readVideo, type VideoRecord } from '../lib/db.ts'
import { copyText, encodePayload, interviewHref, mailShareUrl, sessionConfig, shareText, whatsAppUrl } from '../lib/link.ts'
import { loadPdfFonts, renderReport } from '../lib/pdf.ts'
import { downloadBlob, safeFileName, t } from '../lib/text.ts'
import { SHIPPED } from '../config/shipped.ts'
import { useWorkspace } from '../state/workspace.tsx'

export function ReportPage() {
  const { id = '' } = useParams()
  const [search] = useSearchParams()
  const { config, candidates, role, deleteCandidates } = useWorkspace()
  const [result, setResult] = useState<ScreenResult | null>(null)
  const [video, setVideo] = useState<VideoRecord | null>(null)
  const [showVideo, setShowVideo] = useState(search.get('watch') === '1')
  const [url, setUrl] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const person = candidates.find((item) => item.id === id) ?? null

  useEffect(() => {
    void readResult(id).then(setResult)
  }, [id])

  useEffect(() => {
    if (!showVideo) return
    let cancelled = false
    void readVideo(id).then((record) => {
      if (cancelled || !record) return
      setVideo(record)
      const blob = new Blob(record.parts, { type: record.mime || 'video/webm' })
      setUrl(URL.createObjectURL(blob))
    })
    return () => {
      cancelled = true
    }
  }, [id, showVideo])

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  async function downloadPdf() {
    if (!result) return
    const fonts = await loadPdfFonts()
    const report = renderReport(reportInput(result, person, config, role), fonts)
    downloadBlob(new Blob([Uint8Array.from(report.bytes)], { type: 'application/pdf' }), `${safeFileName(result.candidateName)}-report.pdf`)
  }

  async function downloadAll() {
    if (!result) return
    const fonts = await loadPdfFonts()
    const report = renderReport(reportInput(result, person, config, role), fonts)
    const record = video ?? (await readVideo(id))
    const blob = record ? new Blob(record.parts, { type: record.mime }) : null
    const bundle = await buildBundle({ result, pdf: report.bytes, video: blob, botName: config.persona.name })
    downloadBlob(bundle, `${safeFileName(result.candidateName)}-result.zip`)
  }

  if (!result) return <p className="text-xl">Loading the report…</p>
  const link = person
    ? interviewHref(
        window.location.origin,
        window.location.pathname,
        person.linkCode,
        encodePayload({
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
          role: person.roleSnapshot ?? role ?? resultRole(result),
          config: sessionConfig(config, SHIPPED.copy),
        }),
      )
    : ''

  return (
    <article data-testid="report-page" className="space-y-8">
      <Link to="/" className="underline">{t(config, 'back')}</Link>
      {result.partial ? <p data-testid="partial-banner" className="rounded-2xl bg-soft px-4 py-3 text-xl">{config.pdf.partialBanner}</p> : null}
      <header>
        <h1 className="text-4xl font-bold">{result.candidateName || person?.name}</h1>
        <p className="mt-2 text-muted">{result.roleTitle}</p>
        <p data-testid="score" className="mt-4 text-3xl">{t(config, 'outOf', { score: result.total })}</p>
        <p>{t(config, 'starsLabel', { stars: result.stars })}</p>
        <p data-testid="recommendation" className="text-2xl font-bold">{result.recommendationLabel}</p>
        <p data-testid="rubric-version" className="text-muted">{t(config, 'rubricOnReport', { version: result.rubricVersion })}</p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button type="button" data-testid="download-pdf" onClick={() => void downloadPdf()}>{t(config, 'downloadPdf')}</Button>
        <Button type="button" variant="secondary" data-testid="watch-video" onClick={() => setShowVideo(true)}>{t(config, 'watchVideo')}</Button>
        <Button type="button" variant="secondary" onClick={() => void downloadAll()}>{t(config, 'downloadEverything')}</Button>
      </div>
      {showVideo ? (
        url ? (
          <div className="space-y-4">
            <video
              data-testid="video"
              controls
              src={url}
              className="w-full rounded-2xl bg-black"
              onTimeUpdate={(event) => {
                const time = event.currentTarget.currentTime * 1000
                const index = result.transcript.findLastIndex((turn) => turn.offsetMs <= time)
                if (index >= 0) setActive(index)
              }}
            />
            <ul className="max-h-80 space-y-2 overflow-auto">
              {result.transcript.map((turn, index) => (
                <li key={`${turn.at}-${index}`}>
                  <button
                    type="button"
                    data-testid="transcript-line"
                    className={index === active ? 'font-bold' : ''}
                    onClick={() => {
                      const player = document.querySelector('video')
                      if (player) player.currentTime = turn.offsetMs / 1000
                    }}
                  >
                    {turn.speaker === 'bot' ? config.persona.name : result.candidateName}: {turn.text}
                    {turn.lowConfidence ? ` (${t(config, 'checkWording')})` : ''}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>{t(config, 'noVideo')}</p>
        )
      ) : null}
      <section>
        <h2 className="text-2xl font-bold">{t(config, 'why')}</h2>
        <ul className="mt-2 list-disc pl-5">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </section>
      <section>
        <h2 className="text-2xl font-bold">{t(config, 'breakdown')}</h2>
        <ul className="mt-3 space-y-3">
          {result.breakdown.map((row) => (
            <li key={row.key}>
              <p className="font-bold">{row.label}: {row.score} · weight {row.weight}</p>
              <p className="text-muted">{row.detail}</p>
            </li>
          ))}
        </ul>
      </section>
      {result.redFlags.length ? (
        <section>
          <h2 className="text-2xl font-bold">{t(config, 'redFlags')}</h2>
          <ul className="mt-2 list-disc pl-5">{result.redFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
        </section>
      ) : null}
      {result.reviewFlags.length ? (
        <section>
          <h2 className="text-2xl font-bold">{t(config, 'checkWording')}</h2>
          <p>{t(config, 'lowConfidenceNote')}</p>
          <ul className="mt-2 list-disc pl-5">{result.reviewFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
        </section>
      ) : null}
      <section>
        <h2 className="text-2xl font-bold">{t(config, 'covered')}</h2>
        <ul className="mt-3 space-y-4">
          {result.covered.map((item) => (
            <li key={item.id}>
              <p className="text-muted">{item.question}</p>
              <p>{item.answer || config.pdf.notProvidedText}</p>
            </li>
          ))}
        </ul>
      </section>
      {result.missed.length ? (
        <section>
          <h2 className="text-2xl font-bold">{t(config, 'missed')}</h2>
          <ul className="mt-2 list-disc pl-5">{result.missed.map((item) => <li key={item.id}>{item.question}</li>)}</ul>
        </section>
      ) : null}
      {link ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="underline" data-testid="copy-link" onClick={() => void copyText(link)}>{t(config, 'copyLink')}</button>
          <a className="underline" href={whatsAppUrl(shareText(config, result.candidateName, result.roleTitle), link)}>{t(config, 'shareWhatsApp')}</a>
          <a className="underline" href={mailShareUrl(config.notifications.mailto, 'Interview', link)}>{t(config, 'shareEmail')}</a>
        </div>
      ) : null}
      <button
        type="button"
        className="underline"
        onClick={() => {
          const ok = window.confirm(t(config, 'confirmDelete', { name: result.candidateName }))
          if (ok) void deleteCandidates([id]).then(() => { window.location.hash = '#/' })
        }}
      >
        {t(config, 'delete')}
      </button>
    </article>
  )
}

function reportInput(
  result: ScreenResult,
  person: Candidate | null,
  config: ReturnType<typeof useWorkspace>['config'],
  role: ReturnType<typeof useWorkspace>['role'],
) {
  return {
    config,
    result,
    person: {
      name: person?.name || result.candidateName,
      email: person?.email || '',
      phone: person?.phone || '',
      fileName: person?.fileName || '',
      cvScore: person?.cvScore ?? null,
    },
    role: {
      title: role?.title || result.roleTitle,
      requiredSkills: role?.requiredSkills ?? [],
      minYears: role?.minYears ?? 0,
      location: role?.location || '',
      currency: role?.currency || '',
      budgetMin: role?.budgetMin ?? null,
      budgetMax: role?.budgetMax ?? null,
    },
  }
}

function resultRole(result: ScreenResult) {
  return {
    id: 'role',
    title: result.roleTitle,
    requiredSkills: [],
    niceToHaveSkills: [],
    minYears: 0,
    location: '',
    remoteOk: false,
    currency: '',
    budgetMin: null,
    budgetMax: null,
    description: '',
    updatedAt: 0,
  }
}