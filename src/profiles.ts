import type { Difficulty } from './config.ts'

export interface Profile {
  id: string
  role: string
  tech: string[]
  questions: string[]
  difficulty: Difficulty
}

export const EXAMPLE_PROFILES: Profile[] = [
  {
    id: 'ex-frontend',
    role: 'Frontend Developer (React)',
    tech: ['React', 'TypeScript', 'HTML/CSS', 'REST APIs'],
    difficulty: 'Medium',
    questions: [
      'What is your notice period, and when could you start?',
      'Are you comfortable working from our office two days a week?',
      'Tell me about a user interface you built that you are proud of.',
      'How do you make sure a page works well on both phones and laptops?',
    ],
  },
  {
    id: 'ex-java',
    role: 'Java Backend Engineer',
    tech: ['Java', 'Spring', 'SQL', 'Microservices', 'Kafka'],
    difficulty: 'Hard',
    questions: [
      'What is your notice period?',
      'What are your salary expectations for this role?',
      'Describe a production issue you debugged and how you fixed it.',
      'How do you keep an API backward compatible when it changes?',
    ],
  },
  {
    id: 'ex-qa',
    role: 'QA Engineer (Fresher / Junior)',
    tech: ['Manual Testing', 'Selenium', 'SQL'],
    difficulty: 'Easy',
    questions: [
      'Why are you interested in a career in software testing?',
      'Are you open to working in shifts if a release needs it?',
      'Tell me about a bug you found that you were proud of.',
      'How would you test a simple login page?',
    ],
  },
  {
    id: 'ex-devops',
    role: 'Senior DevOps / Platform Engineer',
    tech: ['AWS', 'Kubernetes', 'Terraform', 'CI/CD', 'Linux'],
    difficulty: 'Tough',
    questions: [
      'What is your notice period, and are you open to on-call rotation?',
      'Walk me through the most serious outage you handled.',
      'How do you decide what to automate first in a new team?',
      'How do you keep cloud costs under control?',
    ],
  },
]

const KEY = 'hiring.profiles.v1'

export function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const list = JSON.parse(raw).map(normalizeProfile).filter(Boolean) as Profile[]
      if (list.length) return list
    }
  } catch { /* fall through */ }
  return EXAMPLE_PROFILES.map((p) => ({ ...p }))
}

export function saveProfiles(list: Profile[]): void {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

const DIFFS = ['Easy', 'Medium', 'Hard', 'Tough']

/** Validate anything that claims to be a profile (imports, links). */
export function normalizeProfile(x: unknown): Profile | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const role = typeof o.role === 'string' ? o.role.trim().slice(0, 120) : ''
  const tech = Array.isArray(o.tech) ? o.tech.filter((t) => typeof t === 'string' && t.trim()).map((t) => (t as string).trim().slice(0, 40)).slice(0, 20) : []
  const questions = Array.isArray(o.questions) ? o.questions.filter((q) => typeof q === 'string' && q.trim()).map((q) => (q as string).trim().slice(0, 300)).slice(0, 12) : []
  const difficulty = DIFFS.includes(o.difficulty as string) ? (o.difficulty as Profile['difficulty']) : 'Medium'
  if (!role || questions.length < 1) return null
  return { id: typeof o.id === 'string' && o.id ? o.id : newId(), role, tech, questions, difficulty }
}

export function profileProblems(p: Profile): string[] {
  const out: string[] = []
  if (!p.role.trim()) out.push('Add a role name.')
  if (p.questions.filter((q) => q.trim()).length < 4) out.push('Add at least 4 mandatory questions.')
  return out
}
