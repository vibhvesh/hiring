import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { fmtYears } from './extract.ts'
import type { Result } from './interview.ts'

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

export function transcriptText(r: Result): string {
  return r.transcript
    .map((t) => {
      const flag = t.who === 'candidate' && !t.typed && t.confidence != null && t.confidence < 0.6 ? ' [low recognition confidence]' : ''
      return `[${mmss(t.at)}] ${t.who === 'ai' ? 'Interviewer' : r.candidateName}${t.typed ? ' (typed)' : ''}: ${t.text}${flag}`
    })
    .join('\n')
}

export function profileLine(r: Result): string {
  const f = r.facts
  return [f.years != null ? fmtYears(f.years) : 'years unknown', f.role ?? 'role unknown', f.seniority, f.stack.join(', ') || 'stack unknown'].join(' · ')
}

export function makePdf(r: Result): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth() - 80
  let y = 50
  const line = (text: string, size = 10, bold = false, gap = 4) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    for (const l of doc.splitTextToSize(text, W) as string[]) {
      if (y > 800) { doc.addPage(); y = 50 }
      doc.text(l, 40, y)
      y += size + 3
    }
    y += gap
  }
  line(`Screening report: ${r.candidateName}`, 18, true, 6)
  line(`${r.profile.role} · ${r.profile.difficulty} · ${new Date(r.startedAt).toLocaleString()} · ${Math.round(r.durationSec / 60 * 10) / 10} min`, 10)
  line(`Score: ${r.score.total} / 100 — ${r.score.verdict}${r.complete ? '' : ' (partial)'}`, 14, true)
  line(r.score.recommendation, 11)
  line(`Confirmed profile${r.facts.confirmed ? '' : ' (not confirmed)'}: ${profileLine(r)}`, 10)
  line(`Required skills covered: ${r.score.skillFit}%`, 10)
  for (const n of r.score.notes) line(`• ${n}`, 10, false, 2)
  y += 6
  line('Answers', 13, true)
  r.score.perItem.forEach((p, i) => {
    line(`${i + 1}. ${p.text}  [${p.score}/100${p.flagged ? ', flagged: low confidence, not counted' : ''}]`, 10, true, 1)
    line(r.items[i]?.answer || '(no answer)', 10, false, 6)
  })
  line('Full transcript', 13, true)
  line(transcriptText(r), 9)
  return doc.output('blob')
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidate'
export const zipName = (r: Result) => `hiring-${slug(r.candidateName)}-${r.inviteId}.zip`

export async function makeZip(r: Result, video: Blob | null): Promise<Blob> {
  const z = new JSZip()
  z.file('result.json', JSON.stringify(r, null, 2))
  z.file('report.pdf', makePdf(r))
  z.file('transcript.txt', transcriptText(r))
  if (video) z.file(video.type.includes('mp4') ? 'recording.mp4' : 'recording.webm', video)
  return z.generateAsync({ type: 'blob' })
}

export interface Stored { id: string; result: Result; video: Blob | null; importedAt: string }

export async function readZip(file: Blob): Promise<Stored> {
  const z = await JSZip.loadAsync(file)
  const json = z.file('result.json')
  if (!json) throw new Error('This zip has no result.json. Is it a Hiring results file?')
  const result = JSON.parse(await json.async('string')) as Result
  if (result.version !== 1 || !result.score || !Array.isArray(result.transcript)) throw new Error('This results file is not in a format I recognise.')
  const vid = z.file(/^recording\./)[0]
  const video = vid ? new Blob([await vid.async('arraybuffer')], { type: vid.name.endsWith('mp4') ? 'video/mp4' : 'video/webm' }) : null
  return { id: `${result.inviteId}-${result.startedAt}`, result, video, importedAt: new Date().toISOString() }
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
}
