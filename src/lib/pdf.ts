import { jsPDF } from 'jspdf'
import type { HiringConfig, ScreenResult } from '../config/types.ts'
import { formatClock, hexToRgb, sanitizePdfText, textOr } from './text.ts'

export interface ReportPerson {
  name: string
  email: string
  phone: string
  fileName: string
  cvScore: number | null
}

export interface ReportRole {
  title: string
  requiredSkills: string[]
  minYears: number
  location: string
  currency: string
  budgetMin: number | null
  budgetMax: number | null
}

export interface ReportInput {
  config: HiringConfig
  result: ScreenResult
  person: ReportPerson
  role: ReportRole
}

export interface PdfFonts {
  latin: string
  deva: string
}

export function fontBytesToBinary(bytes: Uint8Array): string {
  let binary = ''
  const size = 0x8000
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size))
  }
  return binary
}

interface Run {
  text: string
  font: 'NotoSans' | 'NotoSansDevanagari'
}

function runsOf(text: string): Run[] {
  const runs: Run[] = []
  let current: Run | null = null
  for (const char of text) {
    const font = /[\u0900-\u097F]/.test(char) ? 'NotoSansDevanagari' : 'NotoSans'
    if (!current || current.font !== font) {
      current = { text: char, font }
      runs.push(current)
    } else current.text += char
  }
  return runs.length ? runs : [{ text: '', font: 'NotoSans' }]
}

class ReportWriter {
  readonly doc: jsPDF
  readonly plain: string[] = []
  private y = 18
  private readonly margin = 16
  private readonly width = 178
  private readonly bottom = 282
  private readonly config: HiringConfig

  constructor(fonts: PdfFonts, config: HiringConfig) {
    this.config = config
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    this.doc.addFileToVFS('NotoSans-Regular.ttf', fonts.latin)
    this.doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
    this.doc.addFileToVFS('NotoSansDevanagari-Regular.ttf', fonts.deva)
    this.doc.addFont('NotoSansDevanagari-Regular.ttf', 'NotoSansDevanagari', 'normal')
    this.doc.setFont('NotoSans', 'normal')
  }

  private measure(text: string, size: number): number {
    this.doc.setFontSize(size)
    return runsOf(text).reduce((sum, run) => {
      this.doc.setFont(run.font, 'normal')
      return sum + this.doc.getTextWidth(run.text)
    }, 0)
  }

  private wrap(text: string, size: number): string[] {
    const lines: string[] = []
    for (const paragraph of text.split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean)
      if (words.length === 0) {
        lines.push('')
        continue
      }
      let current = ''
      for (const word of words) {
        const pieces = this.breakWord(word, size)
        for (const piece of pieces) {
          const trial = current ? `${current} ${piece}` : piece
          if (this.measure(trial, size) <= this.width) current = trial
          else {
            if (current) lines.push(current)
            current = piece
          }
        }
      }
      if (current) lines.push(current)
    }
    return lines.length ? lines : ['']
  }

  private breakWord(word: string, size: number): string[] {
    if (this.measure(word, size) <= this.width) return [word]
    const parts: string[] = []
    let piece = ''
    for (const char of word) {
      const trial = piece + char
      if (this.measure(trial, size) <= this.width) piece = trial
      else {
        if (piece) parts.push(piece)
        piece = char
      }
    }
    if (piece) parts.push(piece)
    return parts.length ? parts : [word]
  }

  private ensure(height: number): void {
    if (this.y + height <= this.bottom) return
    this.doc.addPage()
    this.y = 18
  }

  private drawLine(text: string, x: number, y: number, size: number, color: [number, number, number]): void {
    let cursor = x
    this.doc.setFontSize(size)
    this.doc.setTextColor(...color)
    for (const run of runsOf(text)) {
      this.doc.setFont(run.font, 'normal')
      this.doc.text(run.text, cursor, y)
      cursor += this.doc.getTextWidth(run.text)
    }
  }

  text(value: string, size: number, color: [number, number, number] = [28, 27, 25]): void {
    const clean = sanitizePdfText(value)
    this.plain.push(clean)
    const lineHeight = size * 0.48
    for (const line of this.wrap(clean, size)) {
      this.ensure(lineHeight + 1)
      if (line) this.drawLine(line, this.margin, this.y, size, color)
      this.y += lineHeight
    }
  }

  gap(amount = 3): void {
    this.y += amount
  }

  heading(value: string): void {
    this.gap(2)
    this.text(value, 14, hexToRgb(this.config.pdf.accentColor))
    this.gap(1)
  }

  private paintChrome(): void {
    const pages = this.doc.getNumberOfPages()
    const accent = hexToRgb(this.config.pdf.accentColor)
    for (let page = 1; page <= pages; page += 1) {
      this.doc.setPage(page)
      this.doc.setFont('NotoSans', 'normal')
      this.doc.setFontSize(9)
      this.doc.setTextColor(90, 86, 80)
      const footer = this.config.pdf.footer
      const version = this.config.pdf.showRubricVersion ? `   Score rules ${this.config.version}` : ''
      this.doc.text(`${footer}${version}   ${page} / ${pages}`, this.margin, 290, { maxWidth: this.width })
      if (page === 1) {
        this.doc.setFillColor(...accent)
        this.doc.rect(0, 0, 210, 14, 'F')
        this.doc.setTextColor(246, 245, 242)
        this.doc.setFontSize(11)
        this.doc.text(this.config.pdf.companyName || 'Hiring', this.margin, 9)
        this.doc.text('Voice screen report', 120, 9)
      }
    }
  }

  render(input: ReportInput): void {
    const { config, result, person, role } = input
    const missing = config.pdf.notProvidedText
    this.y = 22
    if (result.partial) {
      this.doc.setFillColor(92, 86, 76)
      this.doc.rect(this.margin, this.y, this.width, 10, 'F')
      this.doc.setTextColor(255, 255, 255)
      this.doc.setFont('NotoSans', 'normal')
      this.doc.setFontSize(11)
      this.doc.text(config.pdf.partialBanner, this.margin + 2, this.y + 7)
      this.plain.push(config.pdf.partialBanner)
      this.y += 14
    }
    const name = textOr(person.name || result.candidateName, 'Candidate')
    this.text(name, 20)
    this.text(
      [role.title || result.roleTitle, person.email, person.phone, person.fileName].filter(Boolean).join('  ·  ') || missing,
      11,
      [80, 76, 70],
    )
    this.gap(2)
    const recommendation = config.recommendations[result.recommendationKey]
    this.text(`${result.total} out of 100`, 16)
    this.text(`${result.stars} of 5 stars`, 12)
    this.text(result.recommendationLabel || recommendation.label, 14, hexToRgb(recommendation.color))
    this.text(recommendation.summary, 11, [80, 76, 70])
    if (config.pdf.showRubricVersion) this.text(`Score rules version ${result.rubricVersion}`, 11, [80, 76, 70])
    this.drawStars(result.stars)
    this.heading('Why this recommendation')
    this.text(result.reasons.join(' ') || missing, 11)
    this.heading('How the score was built')
    for (const row of result.breakdown) {
      this.text(`${row.label}: ${row.score} out of 100, weight ${row.weight}, adds ${row.weighted}`, 11)
      this.text(row.detail, 10, [80, 76, 70])
    }
    this.heading('What they told us')
    this.text(`Skills: ${result.skills.length ? result.skills.join(', ') : missing}`, 11)
    this.text(`Years: ${result.yearsExperience ?? missing}`, 11)
    this.text(`Current pay: ${textOr(result.currentCtc, missing)}`, 11)
    this.text(`Expected pay: ${textOr(result.expectedCtc, missing)}`, 11)
    this.text(`Notice period: ${textOr(result.noticePeriod, missing)}`, 11)
    this.text(`Location: ${textOr(result.location, missing)}`, 11)
    this.text(`Relocation: ${textOr(result.relocation, missing)}`, 11)
    this.text(`Communication: ${result.communicationRating} of 5`, 11)
    this.text(
      `Role: ${role.title || missing}. Minimum ${role.minYears} years. ${role.location || 'Location not set'}. Budget ${role.budgetMin ?? '—'}–${role.budgetMax ?? '—'} ${role.currency}. Skills: ${role.requiredSkills.join(', ') || missing}.`,
      11,
    )
    if (person.cvScore != null) this.text(`CV match before the screen: ${person.cvScore}`, 11)
    if (result.redFlags.length) {
      this.heading('Things to look at')
      for (const flag of result.redFlags) this.text(flag, 11)
    }
    if (result.reviewFlags.length) {
      this.heading('Check wording')
      this.text('These lines may have been misheard. They did not change the communication score.', 11)
      for (const flag of result.reviewFlags) this.text(flag, 11)
    }
    this.heading(result.partial ? 'What was covered' : 'Answers')
    const mandatory = result.covered.filter((answer) => answer.kind === 'mandatory')
    const other = result.covered.filter((answer) => answer.kind !== 'mandatory')
    if (mandatory.length === 0 && other.length === 0) this.text(missing, 11)
    for (const answer of [...mandatory, ...other]) {
      this.text(answer.question, 11, [80, 76, 70])
      this.text(textOr(answer.answer, missing), 11)
      this.gap(1)
    }
    if (result.missed.length) {
      this.heading('What was missed')
      for (const item of result.missed) this.text(item.question, 11)
    }
    this.heading('Summary')
    this.text(result.summary || missing, 11)
    if (config.pdf.showTranscriptAppendix) {
      this.heading('Full transcript')
      let used = 0
      let truncated = false
      for (const turn of result.transcript) {
        const who = turn.speaker === 'bot' ? config.persona.name || 'Alex' : person.name || 'Candidate'
        const clock = formatClock(turn.offsetMs)
        const note = turn.lowConfidence ? ' [check wording]' : ''
        const source = turn.source === 'typed' ? ' [typed]' : ''
        const line = `${clock} ${who}: ${turn.text}${note}${source}`
        if (used + line.length > config.pdf.maxTranscriptChars) {
          truncated = true
          break
        }
        used += line.length
        this.text(line, 10)
      }
      if (truncated) this.text(config.pdf.truncationNote, 10, [138, 98, 50])
      if (result.transcript.length === 0) this.text(missing, 11)
    }
    const logo = config.pdf.logoDataUrl
    if (logo.startsWith('data:image')) {
      try {
        this.doc.setPage(1)
        this.doc.addImage(logo, 'PNG', 176, 18, 16, 16)
      } catch {
        this.plain.push('Logo could not be drawn.')
      }
    }
    this.paintChrome()
  }

  private drawStars(stars: number): void {
    this.ensure(8)
    const accent = hexToRgb(this.config.pdf.accentColor)
    for (let index = 0; index < 5; index += 1) {
      const fill: [number, number, number] = index < stars ? accent : [220, 216, 208]
      this.doc.setFillColor(...fill)
      this.doc.circle(this.margin + 3 + index * 7, this.y, 2.2, 'F')
    }
    this.y += 8
  }
}

export function renderReport(input: ReportInput, fonts: PdfFonts): { bytes: Uint8Array; text: string; pages: number } {
  const writer = new ReportWriter(fonts, input.config)
  writer.render(input)
  const buffer = writer.doc.output('arraybuffer')
  return {
    bytes: new Uint8Array(buffer),
    text: writer.plain.join('\n'),
    pages: writer.doc.getNumberOfPages(),
  }
}

export async function loadPdfFonts(): Promise<PdfFonts> {
  const [latin, deva] = await Promise.all([
    fetch(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url)).then((response) => response.arrayBuffer()),
    fetch(new URL('../assets/fonts/NotoSansDevanagari-Regular.ttf', import.meta.url)).then((response) =>
      response.arrayBuffer(),
    ),
  ])
  return {
    latin: fontBytesToBinary(new Uint8Array(latin)),
    deva: fontBytesToBinary(new Uint8Array(deva)),
  }
}