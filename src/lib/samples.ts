import type { Candidate, HiringConfig, RoleProfile, ScreenResult } from '../config/types.ts'
import { scoreCv, extractFields } from './cv.ts'
import { evaluateScreen } from './evaluate.ts'
import { createInterview, forceClose, receiveAnswer, type InterviewSeed } from './interview.ts'
import { makeCode } from './link.ts'

const role: RoleProfile = {
  id: 'example-role',
  title: 'Senior frontend engineer',
  requiredSkills: ['react', 'typescript', 'css'],
  niceToHaveSkills: ['node.js'],
  minYears: 5,
  location: 'Bengaluru',
  remoteOk: false,
  currency: 'INR',
  budgetMin: 20,
  budgetMax: 40,
  description: 'react typescript',
  updatedAt: 1_700_000_000_000,
}

const CVS = {
  priya: `Priya Shah
priya.shah@example.com
+91 98450 11111
Location: Bengaluru
Skills: React, TypeScript, CSS, Node.js
6 years experience
CTC: 28 LPA
Led the migration of our design system and cut the bundle by 30 percent.`,
  arun: `Arun Mehta
arun@example.com
Location: Pune
Skills: Selenium
1 year experience
CTC: 8 LPA`,
  hindi: `प्रिया शर्मा
priya.sharma@example.com
Location: Delhi
Skills: React, CSS
4 years experience`,
  lena: `Lena Okonkwo
lena@example.com
Location: Bengaluru
Skills: React, CSS, HTML
4 years experience
CTC: 22 LPA
Built an internal dashboard used by the support team.`,
  samir: `Samir Iqbal
samir@example.com
Location: Hyderabad
Skills: React, TypeScript, CSS, GraphQL
7 years experience
CTC: 32 LPA`,
  nora: `Nora Blake
nora@example.com
Location: Remote
Skills: React, TypeScript, CSS
8 years experience
CTC: 30 LPA
Shipped a design system used by four product teams.`,
}

function personFromCv(id: string, code: string, text: string, config: HiringConfig, now: number): Candidate {
  const parsed = extractFields(text, `${id}.txt`, role.requiredSkills)
  const score = scoreCv(parsed, role, config)
  return {
    id,
    linkCode: code,
    name: parsed.name || id,
    email: parsed.email,
    phone: parsed.phone,
    fileName: `${id}.txt`,
    cvText: parsed.rawText,
    skills: parsed.skills,
    yearsExperience: parsed.yearsExperience,
    location: parsed.location,
    currentCtc: parsed.currentCtc,
    education: parsed.education,
    cvScore: score.total,
    cvShortlisted: score.shortlisted,
    cvNotes: score.notes,
    matchedSkills: score.matchedSkills,
    missingSkills: score.missingSkills,
    tailoredQuestions: [],
    roleSnapshot: role,
    status: 'invited',
    interviewScore: null,
    stars: null,
    recommendationKey: null,
    recommendationLabel: null,
    partial: false,
    needsReview: false,
    hasVideo: false,
    rubricVersion: config.version,
    createdAt: now,
    updatedAt: now,
  }
}

function seedFor(candidate: Candidate): InterviewSeed {
  return {
    candidateName: candidate.name,
    company: 'Northwind',
    role,
    cvText: candidate.cvText,
    cvSkills: candidate.skills,
  }
}

function screen(
  candidate: Candidate,
  config: HiringConfig,
  lines: { text: string; confidence?: number | null }[],
  leaveAfter: number | null,
  now: number,
): ScreenResult {
  const seed = seedFor(candidate)
  let step = createInterview(seed, config, now)
  let at = now
  for (let index = 0; index < lines.length; index += 1) {
    if (leaveAfter != null && index === leaveAfter) {
      step = forceClose(step.state, at, config, candidate.name, 'left')
      break
    }
    at += 12_000
    const line = lines[index]
    if (!line || step.done) break
    step = receiveAnswer(
      step.state,
      { text: line.text, confidence: line.confidence ?? 0.92, source: 'speech', at },
      config,
      seed,
    )
    if (step.done) break
  }
  if (!step.done) step = forceClose(step.state, at + 1000, config, candidate.name, 'time')
  const result = evaluateScreen({ config, seed, state: step.state, endedAt: at })
  result.candidateId = candidate.id
  return result
}

function applyResult(candidate: Candidate, result: ScreenResult): void {
  candidate.status = result.partial ? 'partial' : 'complete'
  candidate.interviewScore = result.total
  candidate.stars = result.stars
  candidate.recommendationKey = result.recommendationKey
  candidate.recommendationLabel = result.recommendationLabel
  candidate.partial = result.partial
  candidate.needsReview = result.lowConfidenceCount > 0
  candidate.rubricVersion = result.rubricVersion
  candidate.updatedAt = result.endedAt
}

const PRIYA = [
  "I'm a frontend engineer in Bengaluru. I spend most days in React and TypeScript leading a checkout rebuild for our bank.",
  'I led the migration of our design system to React and cut the main bundle by about thirty percent for a faster checkout.',
  'I am looking to move because the team is shrinking and I want a group that still ships product every week.',
  'Last year I spent the most time rebuilding checkout in React and TypeScript, including the payment step and the tests around it.',
  'I have used React the most, for about six years, including design systems, routing, and performance work on large pages.',
  'I can work in Bengaluru, I can start in a month, and my pay hopes are inside a normal senior band.',
  'I have six years of experience. Current CTC is 28 LPA, expecting 36 LPA. Notice period is 30 days. I am based in Bengaluru and I can relocate.',
  'On React, the outcome that mattered was cutting checkout bundle size. I split routes and dropped unused libraries.',
  'TypeScript taught me to share types with the API client instead of guessing at payloads after a production bug.',
]

export function buildExample(config: HiringConfig, now = Date.now()): {
  role: RoleProfile
  candidates: Candidate[]
  results: ScreenResult[]
} {
  const priya = personFromCv('priya', makeCode(8, () => 0.2), CVS.priya, config, now)
  const arun = personFromCv('arun', makeCode(8, () => 0.4), CVS.arun, config, now + 1)
  const hindi = personFromCv('hindi', makeCode(8, () => 0.6), CVS.hindi, config, now + 2)
  const lena = personFromCv('lena', makeCode(8, () => 0.8), CVS.lena, config, now + 3)
  const samir = personFromCv('samir', makeCode(8, () => 0.15), CVS.samir, config, now + 4)
  const nora = personFromCv('nora', makeCode(8, () => 0.55), CVS.nora, config, now + 5)
  const results = [
    screen(priya, config, PRIYA.map((text) => ({ text })), null, now),
    screen(
      arun,
      config,
      [
        { text: 'I test things sometimes.' },
        { text: 'Not much to say.' },
        { text: 'I need a job.' },
        { text: 'I clicked around a website.' },
        { text: 'Selenium a bit.' },
        { text: 'Pune only.' },
        { text: 'I have one year of experience. Current CTC is 8 LPA, expecting 80 LPA. Notice period is 6 months. I am based in Pune and I will not relocate.' },
      ],
      null,
      now + 1,
    ),
    screen(
      hindi,
      config,
      [
        { text: 'मैं दिल्ली में रहती हूँ और React पर काम करती हूँ। I build interfaces for a retail site.' },
        { text: 'I shipped a small CSS cleanup last year and the pages got a little faster.' },
      ],
      2,
      now + 2,
    ),
    screen(
      lena,
      config,
      [
        { text: 'I am a frontend developer in Bengaluru. I use React and CSS on an internal dashboard every day.' },
        { text: 'I built a support dashboard that the team still uses, and I wrote the layout in CSS without a framework.' },
        { text: 'I am open to a move if the work is still hands-on and the team is kind.' },
        { text: 'The dashboard took most of last year. I owned the tables, filters, and the empty states.' },
        { text: 'CSS is where I am strongest. I have four years of it, including responsive layout and design reviews.' },
        { text: 'Bengaluru is home and I do not need to relocate.' },
        { text: 'I have four years of experience. Current CTC is 22 LPA, expecting 30 LPA. Notice period is 30 days. I am based in Bengaluru and I can relocate.' },
      ],
      null,
      now + 3,
    ),
    screen(
      nora,
      config,
      PRIYA.map((text) => ({ text, confidence: 0.4 })),
      null,
      now + 5,
    ),
  ]
  for (const result of results) {
    const candidate = [priya, arun, hindi, lena, nora].find((item) => item.id === result.candidateId)
    if (candidate) applyResult(candidate, result)
  }
  return { role: { ...role, updatedAt: now }, candidates: [priya, arun, hindi, lena, samir, nora], results }
}