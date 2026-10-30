import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractFacts, extractRole, extractYears, readBack, seniorityOf, wordsToNumber } from './extract.ts'
import { Interview } from './interview.ts'
import { decodeInvite, encodeInvite, inviteUrl } from './link.ts'
import { EXAMPLE_PROFILES, normalizeProfile } from './profiles.ts'
import { levelFor, selectQuestions } from './questions.ts'
import { scoreInterview } from './score.ts'
import { findTech } from './tech.ts'

const fe = EXAMPLE_PROFILES[0]

describe('extraction', () => {
  it('reads number words and digits', () => {
    expect(wordsToNumber('five')).toBe(5)
    expect(wordsToNumber('twenty two')).toBe(22)
    expect(wordsToNumber('two and a half')).toBe(2.5)
    expect(extractYears('I have five years of experience')).toBe(5)
    expect(extractYears('around 3+ yrs in total')).toBe(3)
    expect(extractYears('two and a half years at Infosys')).toBe(2.5)
    expect(extractYears('a couple of years')).toBe(2)
    expect(extractYears('working since 2019', new Date('2026-06-01'))).toBe(7)
    expect(extractYears("I'm a fresher")).toBe(0)
    expect(extractYears('eight months as an intern')).toBe(0.7)
    expect(extractYears('I am 24 years old')).toBeNull()
    expect(extractYears('I like coding')).toBeNull()
  })
  it('finds tech including spoken forms, ignores false hits', () => {
    expect(findTech('mostly react JS and node js, some type script')).toEqual(['React', 'Node.js', 'TypeScript'])
    expect(findTech('C sharp and dot net core on azure')).toEqual(['C#/.NET', 'Azure'])
    expect(findTech('k8s and terraform')).toEqual(['Kubernetes', 'Terraform'])
    expect(findTech('I want to go to the rest of the team')).toEqual([])
  })
  it('finds role', () => {
    expect(extractRole("I'm currently a senior frontend developer at Acme")).toBe('Senior Frontend Developer')
    expect(extractRole('I work as a QA engineer')).toBe('QA Engineer')
    expect(extractRole('I am a student')).toBe('Fresher')
  })
  it('seniority and read-back', () => {
    const f = extractFacts('I have about 5 years, mainly React and Node, working as a frontend developer')
    expect(seniorityOf(f)).toBe('Mid-level')
    expect(readBack(f)).toBe('So you have about 5 years of experience, currently working as a Frontend Developer and mainly with React and Node.js. Is that right?')
  })
})

describe('confirm and retry', () => {
  it('confirms then moves on to mandatory questions', () => {
    const iv = new Interview(fe, 'x1', 'Asha')
    expect(iv.prompt).toContain('Tell me about yourself')
    iv.answer('I am a frontend developer with five years of experience in React and TypeScript')
    expect(iv.phase).toBe('confirm')
    expect(iv.prompt).toContain('5 years')
    iv.answer('yes that is right')
    expect(iv.phase).toBe('mandatory')
    expect(iv.prompt).toContain(fe.questions[0])
  })
  it('asks for each missing piece, at most twice, then proceeds', () => {
    const iv = new Interview(fe, 'x2')
    iv.answer('I like building things')
    expect(iv.phase).toBe('retry')
    expect(iv.prompt).toMatch(/years/)
    iv.answer('hmm')
    expect(iv.prompt).toMatch(/didn't catch.*years/)
    iv.answer('pass')
    expect(iv.prompt).toMatch(/role/)
    iv.answer('developer')
    expect(iv.prompt).toMatch(/technologies/)
    iv.answer('Angular mostly')
    expect(iv.phase).toBe('confirm')
    expect(iv.facts.stack).toEqual(['Angular'])
    expect(iv.facts.years).toBeNull()
  })
  it('accepts corrections', () => {
    const iv = new Interview(fe, 'x3')
    iv.answer('Senior software engineer, 5 years, React and Node')
    iv.answer('No, actually it is 7 years and mostly Angular')
    expect(iv.facts.years).toBe(7)
    expect(iv.facts.stack).toEqual(['Angular'])
    expect(iv.prompt).toContain('Thanks for correcting me')
    iv.answer('yes')
    expect(iv.phase).toBe('mandatory')
  })
  it('asks what to fix on a bare no', () => {
    const iv = new Interview(fe, 'x4')
    iv.answer('Java developer, 3 years, Java and Spring')
    iv.answer('no')
    expect(iv.prompt).toMatch(/What should I correct/)
  })
  it('uses resume facts to fill gaps without blocking', () => {
    const iv = new Interview(fe, 'x5', '', { years: 6, role: 'DevOps Engineer', stack: ['AWS'] })
    iv.answer('I do cloud stuff with kubernetes')
    expect(iv.phase).toBe('confirm')
    expect(iv.prompt).toContain('6 years')
  })
  it('runs to the end, follows up on short answers, and respects the time limit', () => {
    const iv = new Interview(fe, 'x6')
    iv.answer('Frontend developer, 4 years, React')
    iv.answer('yes')
    iv.answer('one month')
    expect(iv.phase).toBe('followup')
    iv.answer('I can join in one month after serving notice')
    expect(iv.phase).toBe('mandatory')
    iv.answer('Sure, two days in office works for me and I live close by', {}, 6 * 60_000)
    expect(iv.done).toBe(true)
    const r = iv.result(6 * 60_000)
    expect(r.items.length).toBe(2)
    expect(r.complete).toBe(true)
  })
})

describe('question selection', () => {
  it('maps seniority + difficulty to depth', () => {
    expect(levelFor('Fresher', 'Easy')).toBe(1)
    expect(levelFor('Mid-level', 'Medium')).toBe(2)
    expect(levelFor('Mid-level', 'Tough')).toBe(3)
    expect(levelFor('Senior', 'Easy')).toBe(2)
  })
  it('asks about the stack first and adds required skills they lack', () => {
    const qs = selectQuestions(['React', 'Node.js'], ['React', 'TypeScript'], 'Mid-level', 'Medium')
    expect(qs).toHaveLength(4)
    expect(qs[0].tech).toBe('React')
    expect(qs.some((q) => q.gap && q.tech === 'TypeScript')).toBe(true)
    expect(new Set(qs.map((q) => q.text)).size).toBe(qs.length)
  })
  it('falls back to required/generic questions when stack is unknown', () => {
    const qs = selectQuestions(['Cobol'], [], 'Junior', 'Easy')
    expect(qs).toHaveLength(3)
    expect(qs.every((q) => q.tech === 'General')).toBe(true)
  })
  it('tough asks more and deeper', () => {
    const qs = selectQuestions(['Java', 'Spring'], ['Java'], 'Senior', 'Tough')
    expect(qs).toHaveLength(5)
    expect(qs[0].level).toBe(3)
  })
})

describe('scoring', () => {
  it('rewards specific answers, flags low confidence without penalty', () => {
    const iv = new Interview(fe, 's1')
    iv.answer('Frontend developer, 5 years, React and TypeScript')
    iv.answer('yes')
    const good = 'State is owned by the component and changes cause a re-render, props come from the parent to the child and are immutable, so I lift state up when siblings need it.'
    for (let k = 0; k < 20 && !iv.done; k++) iv.answer(good + ' I also use useEffect cleanup and dependency arrays and media query, flexbox, grid', { confidence: 0.9 })
    const strong = iv.result(200_000).score
    expect(strong.total).toBeGreaterThan(70)
    const weak = scoreInterview(fe, { years: 1, role: null, stack: [] }, [{ kind: 'tech', text: 'q', answer: 'no idea', confidence: null, typed: true, followedUp: false }, { kind: 'mandatory', text: 'm', answer: 'ok', confidence: null, typed: true, followedUp: false }], true)
    expect(weak.total).toBeLessThan(40)
    const flagged = scoreInterview(fe, { years: 5, role: null, stack: ['React'] }, [
      { kind: 'tech', text: 'q', answer: 'state props parent child re-render immutable and more words here to be long enough', confidence: 0.95, typed: false, followedUp: false },
      { kind: 'tech', text: 'q2', answer: 'garbled', confidence: 0.3, typed: false, followedUp: false },
    ], true)
    expect(flagged.flagged).toBe(1)
    expect(flagged.perItem[1].flagged).toBe(true)
    expect(flagged.notes.join(' ')).toMatch(/not counted against/)
  })
})

describe('links', () => {
  it('round-trips a profile', () => {
    const code = encodeInvite({ id: 'abc', profile: EXAMPLE_PROFILES[1] })
    expect(code).toMatch(/^[A-Za-z0-9+\-$]+$/)
    const back = decodeInvite(code)!
    expect(back.id).toBe('abc')
    expect(back.profile).toEqual(EXAMPLE_PROFILES[1])
    expect(inviteUrl('https://x.io/hiring/#/', { id: 'a', profile: fe })).toMatch(/^https:\/\/x\.io\/hiring\/#\/i\//)
  })
  it('rejects broken links', () => {
    expect(decodeInvite('garbage')).toBeNull()
    expect(decodeInvite(encodeInvite({ id: 'a', profile: fe }).slice(0, 20))).toBeNull()
    expect(normalizeProfile({ role: '', questions: [] })).toBeNull()
  })
})

describe('bundled samples', () => {
  const idx = JSON.parse(readFileSync('public/samples/index.json', 'utf8')) as { file: string; kind: string }[]
  const read = (f: string) => readFileSync(`public/samples/${f}`, 'utf8')
  it('has at least 10 resumes and some job descriptions', () => {
    expect(idx.filter((s) => s.kind === 'resume').length).toBeGreaterThanOrEqual(10)
    expect(idx.filter((s) => s.kind === 'jd').length).toBeGreaterThanOrEqual(3)
  })
  it.each([
    ['resume-react-frontend.txt', 4, 'React'],
    ['resume-java-backend.txt', 7, 'Java'],
    ['resume-python-data.txt', 3, 'Python'],
    ['resume-devops.txt', 6, 'Kubernetes'],
    ['resume-qa-automation.txt', 5, 'Selenium'],
    ['resume-android.txt', 3, 'Kotlin'],
    ['resume-dotnet.txt', 8, 'C#/.NET'],
    ['resume-fresher.txt', 0, 'Java'],
    ['resume-senior-architect.txt', 15, 'Microservices'],
    ['resume-fullstack.txt', 5, 'Node.js'],
  ])('%s parses', (file, years, tech) => {
    const f = extractFacts(read(file))
    expect(f.years).toBe(years)
    expect(f.stack).toContain(tech)
    expect(f.role).toBeTruthy()
  })
  it('job descriptions yield required tech', () => {
    expect(findTech(read('jd-java-backend.txt'))).toEqual(expect.arrayContaining(['Java', 'Spring', 'SQL', 'Kafka']))
  })
})
