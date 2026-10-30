import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { applyConfig } from '../config/apply.ts'
import { SHIPPED } from '../config/shipped.ts'
import type { HiringConfig, RoleProfile } from '../config/types.ts'
import { scoreCv, extractFields, parseDocument } from './cv.ts'
import { evaluateScreen, scoreCommunication } from './evaluate.ts'
import { confidenceIsLow, extractFactsFromText } from './facts.ts'
import {
  acceptLlmLine,
  buildPlan,
  createInterview,
  forceClose,
  receiveAnswer,
  type InterviewSeed,
} from './interview.ts'
import { decodePayload, encodePayload, makeCode, type LinkPayload } from './link.ts'
import { pickMime } from './mime.ts'
import { fontBytesToBinary, renderReport } from './pdf.ts'
import { paginate, queryCandidates } from './query.ts'
import { expiredIds } from './retention.ts'
import { listPaths, nextConfigVersion } from './text.ts'
import type { Candidate } from '../config/types.ts'

const role: RoleProfile = {
  id: 'role-1',
  title: 'Senior frontend engineer',
  requiredSkills: ['react', 'typescript', 'css'],
  niceToHaveSkills: [],
  minYears: 5,
  location: 'Bengaluru',
  remoteOk: false,
  currency: 'INR',
  budgetMin: 20,
  budgetMax: 40,
  description: 'react typescript',
  updatedAt: 1,
}

const strongCv = `Priya Shah
priya.shah@example.com
+91 98450 11111
Location: Bengaluru
Skills: React, TypeScript, CSS, Node.js
6 years experience
CTC: 28 LPA
Led the migration of our design system and cut the bundle by 30 percent.
`

function seed(name = 'Priya Shah', cvText = strongCv, skills = ['react', 'typescript', 'css']): InterviewSeed {
  return {
    candidateName: name,
    company: 'Northwind',
    role,
    cvText,
    cvSkills: skills,
  }
}

function speak(text: string, at: number, confidence: number | null = 0.92) {
  return { text, confidence, source: 'typed' as const, at }
}

describe('config', () => {
  it('accepts the shipped file and repairs a bad value without dropping the rest', () => {
    const clean = applyConfig(SHIPPED)
    expect(clean.warnings).toEqual([])
    expect(clean.config.version).toBe('1.0.0')
    expect(clean.config.mandatoryQuestions).toHaveLength(4)
    const broken = structuredClone(SHIPPED) as HiringConfig
    broken.interview.durationLimitSeconds = 5
    broken.interview.openingGreeting = ''
    broken.scoring.thresholds.maybeMin = 90
    broken.scoring.thresholds.shortlistMin = 70
    const repaired = applyConfig(broken)
    expect(repaired.config.interview.durationLimitSeconds).toBe(60)
    expect(repaired.config.interview.openingGreeting).toBe(SHIPPED.interview.openingGreeting)
    expect(repaired.config.scoring.thresholds.maybeMin).toBe(70)
    expect(repaired.config.persona.name).toBe('Alex')
    expect(repaired.warnings.length).toBeGreaterThan(0)
  })

  it('bumps the score-rules version when settings change', () => {
    const next = nextConfigVersion(SHIPPED, {
      ...SHIPPED,
      scoring: { ...SHIPPED.scoring, thresholds: { ...SHIPPED.scoring.thresholds, shortlistMin: 80 } },
    })
    expect(next.version).toBe('1.0.1')
    expect(nextConfigVersion(SHIPPED, SHIPPED).version).toBe('1.0.0')
  })

  it('lists every shipped key for the settings catalog', () => {
    const paths = listPaths(SHIPPED)
    expect(paths).toContain('interview.durationLimitSeconds')
    expect(paths).toContain('interview.capMode')
    expect(paths).toContain('interview.openingGreeting')
    expect(paths).toContain('interview.asr.lowConfidenceThreshold')
    expect(paths).toContain('privacy.retentionDays')
    expect(paths).toContain('pdf.companyName')
    expect(paths.length).toBeGreaterThan(80)
  })
})

describe('cv scoring', () => {
  it('shortlists a strong CV and scores a mismatch low', () => {
    const parsed = extractFields(strongCv, 'priya.txt', role.requiredSkills)
    expect(parsed.name).toBe('Priya Shah')
    expect(parsed.email).toBe('priya.shah@example.com')
    expect(parsed.yearsExperience).toBe(6)
    expect(parsed.location).toContain('Bengaluru')
    const score = scoreCv(parsed, role, SHIPPED)
    expect(score.skillScore).toBe(55)
    expect(score.experienceScore).toBe(20)
    expect(score.locationScore).toBe(10)
    expect(score.keywordScore).toBe(15)
    expect(score.total).toBe(100)
    expect(score.shortlisted).toBe(true)

    const junior = extractFields(
      'Arun Mehta\narun@example.com\nLocation: Pune\nSkills: Selenium\n1 year experience\n',
      'arun.txt',
      role.requiredSkills,
    )
    const low = scoreCv(junior, role, SHIPPED)
    expect(low.total).toBe(6)
    expect(low.shortlisted).toBe(false)
  })

  it('reads a docx resume', async () => {
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>Meera Iyer meera@example.com React TypeScript 4 years Bengaluru</w:t></w:r></w:p></w:body>
      </w:document>`
    const zip = new JSZip()
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        </Types>`,
    )
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
        </Relationships>`,
    )
    zip.file('word/document.xml', document)
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })
    const parsed = await parseDocument('meera.docx', buffer)
    expect(parsed.rawText).toContain('Meera Iyer')
    expect(parsed.skills).toContain('react')
  })
})

describe('facts and fairness', () => {
  it('reads pay, notice, years, and location from a spoken answer', () => {
    const facts = extractFactsFromText(
      "I have six years of experience. Current CTC is 28 LPA, expecting 36 LPA. Notice period is 30 days. I'm based in Bengaluru and I can relocate.",
      ['react'],
    )
    expect(facts.yearsExperience).toBe(6)
    expect(facts.currentCtcValue).toBe(28)
    expect(facts.expectedCtcValue).toBe(36)
    expect(facts.noticeDays).toBe(30)
    expect(facts.location).toContain('Bengaluru')
    expect(facts.relocation).toBe('Yes')
  })

  it('does not treat a Chrome zero confidence as a bad transcript', () => {
    expect(confidenceIsLow(0, SHIPPED)).toBe(false)
    expect(confidenceIsLow(null, SHIPPED)).toBe(false)
    expect(confidenceIsLow(0.4, SHIPPED)).toBe(true)
    expect(confidenceIsLow(0.9, SHIPPED)).toBe(false)
  })
})

describe('interview flow', () => {
  it('asks both warm-ups, then every mandatory question, before anything else', () => {
    const plan = buildPlan(seed(), SHIPPED)
    expect(plan.slice(0, 2).every((item) => item.kind === 'warmup')).toBe(true)
    expect(plan.slice(2, 6).map((item) => item.kind)).toEqual(['mandatory', 'mandatory', 'mandatory', 'mandatory'])
    expect(plan[6]?.kind).toBe('logistics')
    const opened = createInterview(seed(), SHIPPED, 0)
    expect(opened.say).toContain('Priya Shah')
    expect(opened.say).toContain(SHIPPED.interview.warmupQuestions[0])
    const answers = [
      "I'm a frontend engineer in Bengaluru. I spend most days in React and TypeScript leading a checkout rebuild for our bank.",
      'I led the migration of our design system to React and cut the main bundle by about thirty percent for a faster checkout.',
      'I am looking to move because the team is shrinking and I want a group that still ships product every week.',
      'Last year I spent the most time rebuilding checkout in React and TypeScript, including the payment step and the tests around it.',
      'I have used React the most, for about six years, including design systems, routing, and performance work on large pages.',
      'I can work in Bengaluru, I can start in a month, and my pay hopes are inside a normal senior band.',
      'I have six years of experience. Current CTC is 28 LPA, expecting 36 LPA. Notice period is 30 days. I am based in Bengaluru and I can relocate.',
    ]
    let step = opened
    const spoken: string[] = [opened.say ?? '']
    answers.forEach((text, index) => {
      step = receiveAnswer(step.state, speak(text, (index + 1) * 10_000), SHIPPED, seed())
      spoken.push(step.say ?? '')
    })
    const mandatoryAt = SHIPPED.mandatoryQuestions.map((question) =>
      spoken.findIndex((line) => line.includes(question.prompt)),
    )
    expect(mandatoryAt.every((index) => index > 0)).toBe(true)
    const logisticsAt = spoken.findIndex((line) => line.includes('practical things'))
    expect(Math.max(...mandatoryAt)).toBeLessThan(logisticsAt)
    expect(step.state.answers.filter((answer) => answer.kind === 'mandatory')).toHaveLength(4)
    expect(step.state.answers.every((answer) => answer.kind !== 'mandatory' || answer.answer.length > 20)).toBe(true)
  })

  it('wraps up at the time limit and keeps a partial record of what was missed', () => {
    const hard = applyConfig({ ...SHIPPED, interview: { ...SHIPPED.interview, capMode: 'hard', graceSeconds: 0 } }).config
    const opened = createInterview(seed(), hard, 0)
    const step = receiveAnswer(opened.state, speak('I build React apps for banks and I like the work.', 301_000), hard, seed())
    expect(step.done).toBe(true)
    expect(step.state.partial).toBe(true)
    expect(step.state.closedBecause).toBe('time')
    expect(step.say?.toLowerCase()).toContain('thank')
    expect(step.state.missed.some((item) => item.id === 'why-move')).toBe(true)

    const soft = createInterview(seed(), SHIPPED, 0)
    const duringGrace = receiveAnswer(soft.state, speak('Still here, talking about my React work in Bengaluru today.', 305_000), SHIPPED, seed())
    expect(duringGrace.done).toBe(false)

    const fresh = createInterview(seed(), SHIPPED, 0)
    const left = forceClose(fresh.state, 20_000, SHIPPED, 'Priya Shah', 'left')
    expect(left.state.partial).toBe(true)
    expect(left.say).toContain('ended early')
  })

  it('follows up once on a thin warm-up and does not follow up on mandatory questions', () => {
    const opened = createInterview(seed(), SHIPPED, 0)
    const thin = receiveAnswer(opened.state, speak('I write code.', 5_000), SHIPPED, seed())
    expect(thin.say).toContain('concrete example')
    expect(thin.state.index).toBe(0)
    const mandatoryStart = receiveAnswer(thin.state, speak('I write React code every day for a checkout team and I am proud of the faster page.', 8_000), SHIPPED, seed())
    const second = receiveAnswer(mandatoryStart.state, speak('I shipped a design system that other teams still use across the bank.', 12_000), SHIPPED, seed())
    const shortMandatory = receiveAnswer(second.state, speak('Because.', 15_000), SHIPPED, seed())
    expect(shortMandatory.say).not.toContain('concrete example')
    expect(shortMandatory.state.answers.some((answer) => answer.answer === 'Because.')).toBe(true)
  })
})

describe('scoring rubric', () => {
  it('scores from answers only and ignores speech-recognition confidence', () => {
    const base = seed()
    function run(confidence: number | null) {
      let step = createInterview(base, SHIPPED, 0)
      const lines = [
        'I am a frontend engineer using React and TypeScript every day for a large checkout product in Bengaluru.',
        'I led a design system migration and cut the bundle by thirty percent, which made checkout faster.',
        'I want to move because I would like a team that still invests in the product and the people building it.',
        'The project I spent the most time on was the checkout rebuild, from the form through payment and the tests.',
        'React is the skill I know most deeply, about six years of production work including performance and design systems.',
        'Bengaluru works, my notice is short, and I am comfortable talking about pay in the next conversation.',
        'I have six years of experience. Current CTC is 28 LPA, expecting 36 LPA. Notice period is 30 days. I am based in Bengaluru and I can relocate.',
        'On React, the outcome that mattered was cutting checkout bundle size. I split routes and dropped unused libraries.',
        'TypeScript taught me to share types with the API client instead of guessing at payloads after a production bug.',
      ]
      lines.forEach((text, index) => {
        if (step.done) return
        step = receiveAnswer(step.state, speak(text, (index + 1) * 12_000, confidence), SHIPPED, base)
      })
      if (!step.done) step = forceClose(step.state, 200_000, SHIPPED, base.candidateName, 'time')
      return evaluateScreen({ config: SHIPPED, seed: base, state: step.state, endedAt: 200_000 })
    }
    const unsure = run(0.42)
    const sure = run(0.95)
    const unknown = run(0)
    const communication = (result: { breakdown: { key: string; score: number }[] }) =>
      result.breakdown.find((row) => row.key === 'communication')?.score
    expect(communication(unsure)).toBe(communication(sure))
    expect(communication(unknown)).toBe(communication(sure))
    expect(unsure.lowConfidenceCount).toBeGreaterThan(0)
    expect(sure.lowConfidenceCount).toBe(0)
    expect(unknown.lowConfidenceCount).toBe(0)
    expect(unsure.reviewFlags.length).toBe(unsure.lowConfidenceCount)
    expect(sure.rubricVersion).toBe('1.0.0')
    expect(sure.total).toBeGreaterThanOrEqual(72)
    expect(sure.recommendationKey).toBe('shortlist')
    expect(sure.stars).toBeGreaterThanOrEqual(4)
    expect(scoreCommunication(['one two three four five six seven eight nine ten eleven twelve'], 24, 12)).toBe(65)
  })
})

describe('pdf', () => {
  async function fonts() {
    const [latin, deva] = await Promise.all([
      readFile('src/assets/fonts/NotoSans-Regular.ttf'),
      readFile('src/assets/fonts/NotoSansDevanagari-Regular.ttf'),
    ])
    return { latin: fontBytesToBinary(latin), deva: fontBytesToBinary(deva) }
  }

  function result(overrides: Partial<ReturnType<typeof evaluateScreen>> = {}) {
    const base = seed('प्रिया शर्मा')
    let step = createInterview(base, SHIPPED, 0)
    step = receiveAnswer(
      step.state,
      speak('I build interfaces and I am happy to talk through the work in either language.', 5_000),
      SHIPPED,
      base,
    )
    step = forceClose(step.state, 8_000, SHIPPED, base.candidateName, 'left')
    return {
      ...evaluateScreen({ config: SHIPPED, seed: base, state: step.state, endedAt: 8_000 }),
      ...overrides,
    }
  }

  it('builds a unicode report for empty, odd, Hindi, and very long text', async () => {
    const loaded = await fonts()
    const longName = `${'A'.repeat(180)} प्रिया शर्मा Müller José`
    const longTranscript = result()
    longTranscript.transcript = Array.from({ length: 80 }, (_, index) => ({
      speaker: index % 2 === 0 ? 'bot' : 'candidate',
      text: `Line ${index}. ${'detail '.repeat(30)}`,
      at: index * 1000,
      offsetMs: index * 1000,
      confidence: index % 5 === 0 ? 0.4 : 0.9,
      source: 'speech',
      lowConfidence: index % 5 === 0,
      phase: 'warmup',
      questionId: 'warmup-1',
    }))
    const odd = renderReport(
      {
        config: SHIPPED,
        result: {
          ...longTranscript,
          candidateName: longName,
          currentCtc: null,
          expectedCtc: '',
          reasons: [],
          breakdown: longTranscript.breakdown,
          summary: '<script>alert(1)</script> and a normal sentence',
        },
        person: { name: longName, email: '', phone: '', fileName: '', cvScore: null },
        role: { ...role, title: '', requiredSkills: [], location: '' },
      },
      loaded,
    )
    expect(new TextDecoder().decode(odd.bytes.slice(0, 5))).toBe('%PDF-')
    expect(odd.text).toContain('प्रिया शर्मा')
    expect(odd.text).toContain('Müller')
    expect(odd.text).toContain('José')
    expect(odd.text).toContain(longName)
    expect(odd.text).toContain('PARTIAL')
    expect(odd.text).toContain('Score rules version 1.0.0')
    expect(odd.text).toContain('<script>alert(1)</script>')
    expect(odd.pages).toBeGreaterThan(1)

    const huge = result()
    huge.transcript = [
      {
        speaker: 'candidate',
        text: 'शब्द '.repeat(20_000),
        at: 1,
        offsetMs: 1,
        confidence: null,
        source: 'typed',
        lowConfidence: false,
        phase: 'warmup',
        questionId: null,
      },
    ]
    const capped = applyConfig({
      ...SHIPPED,
      pdf: { ...SHIPPED.pdf, maxTranscriptChars: 2000 },
    }).config
    const truncated = renderReport(
      {
        config: capped,
        result: huge,
        person: { name: 'प्रिया शर्मा', email: 'a@b.co', phone: '', fileName: 'cv.pdf', cvScore: 10 },
        role,
      },
      loaded,
    )
    expect(truncated.text).toContain(capped.pdf.truncationNote)
    expect(truncated.pages).toBeGreaterThan(0)

    const empty = renderReport(
      {
        config: SHIPPED,
        result: {
          ...result(),
          candidateName: '',
          transcript: [],
          covered: [],
          missed: [],
          reasons: [],
          redFlags: [],
          reviewFlags: [],
          skills: [],
          summary: '',
          breakdown: [],
        },
        person: { name: '', email: '', phone: '', fileName: '', cvScore: null },
        role,
      },
      loaded,
    )
    expect(new TextDecoder().decode(empty.bytes.slice(0, 5))).toBe('%PDF-')
    expect(empty.text).toContain('Not said')
    expect(empty.text).toContain('Candidate')
  })
})

describe('links, query, retention, mime', () => {
  it('round-trips a compressed interview link', () => {
    const payload: LinkPayload = {
      v: 1,
      id: 'cand-1',
      code: makeCode(8, () => 0.1),
      name: 'Priya Shah',
      email: 'priya@example.com',
      phone: '',
      skills: ['react'],
      yearsExperience: 6,
      location: 'Bengaluru',
      cvText: strongCv,
      role,
      config: SHIPPED,
    }
    const encoded = encodePayload(payload)
    const decoded = decodePayload(encoded)
    expect(decoded?.name).toBe('Priya Shah')
    expect(decoded?.config.version).toBe('1.0.0')
    expect(decoded?.config.mandatoryQuestions).toHaveLength(4)
    expect(makeCode(8, () => 0)).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('filters, sorts, and pages candidates', () => {
    const people: Candidate[] = [
      { ...blank('a', 'Ada'), interviewScore: 80, recommendationKey: 'shortlist', updatedAt: 2 },
      { ...blank('b', 'Bea'), interviewScore: 50, recommendationKey: 'maybe', needsReview: true, updatedAt: 3 },
      { ...blank('c', 'Cia'), interviewScore: null, cvScore: 90, updatedAt: 1 },
    ]
    expect(queryCandidates(people, { q: 'ada', filter: 'all', sort: 'name' }).map((person) => person.id)).toEqual(['a'])
    expect(queryCandidates(people, { q: '', filter: 'review', sort: 'newest' })).toHaveLength(1)
    expect(queryCandidates(people, { q: '', filter: 'unscreened', sort: 'score' })[0]?.id).toBe('c')
    const page = paginate(people, 2, 2)
    expect(page.items).toHaveLength(1)
    expect(page.pages).toBe(2)
    expect(expiredIds([{ id: 'old', updatedAt: 0 }], Date.parse('2026-10-29T00:00:00Z'), 30)).toEqual(['old'])
  })

  it('prefers mp4 when webm is unavailable', () => {
    expect(pickMime(['video/webm', 'video/mp4'], (mime) => mime === 'video/mp4')).toBe('video/mp4')
  })
})

function blank(id: string, name: string): Candidate {
  return {
    id,
    linkCode: id,
    name,
    email: '',
    phone: '',
    fileName: '',
    cvText: '',
    skills: [],
    yearsExperience: null,
    location: '',
    currentCtc: null,
    education: '',
    cvScore: null,
    cvShortlisted: false,
    cvNotes: [],
    matchedSkills: [],
    missingSkills: [],
    tailoredQuestions: [],
    roleSnapshot: null,
    status: 'new',
    interviewScore: null,
    stars: null,
    recommendationKey: null,
    recommendationLabel: null,
    partial: false,
    needsReview: false,
    hasVideo: false,
    rubricVersion: null,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('llm guard', () => {
  it('rejects a list and keeps a single spoken question', () => {
    expect(acceptLlmLine('How did that go?', 'What changed after you shipped it?')).toBe(true)
    expect(acceptLlmLine('How did that go?', '- one\n- two')).toBe(false)
    expect(acceptLlmLine('How did that go?', 'Sure.')).toBe(false)
  })
})