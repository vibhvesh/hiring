import type { HiringConfig, RoleProfile, TranscriptTurn } from '../config/types.ts'
import {
  confidenceIsLow,
  emptyFacts,
  extractFactsFromText,
  isNoise,
  mergeFacts,
  type Facts,
} from './facts.ts'
import { canonicalSkill, sameSkill, skillPresent } from './skills.ts'
import { fill, wordCount } from './text.ts'

export interface InterviewSeed {
  candidateName: string
  company: string
  role: RoleProfile
  cvText: string
  cvSkills: string[]
}

export interface PlanItem {
  id: string
  kind: string
  text: string
}

export interface AnswerRecord {
  id: string
  kind: string
  question: string
  answer: string
}

export interface EngineState {
  plan: PlanItem[]
  index: number
  startedAt: number
  followUps: number
  retries: number
  turns: TranscriptTurn[]
  answers: AnswerRecord[]
  missed: { id: string; question: string }[]
  phase: 'question' | 'done'
  closedBecause: 'completed' | 'time' | 'left' | null
  partial: boolean
  mode: 'scripted' | 'on-device'
  facts: Facts
}

export interface CandidateInput {
  text: string
  confidence: number | null
  source: 'speech' | 'typed'
  at: number
}

export interface EngineStep {
  state: EngineState
  say: string | null
  done: boolean
}

function varsFor(seed: InterviewSeed, config: HiringConfig, extra: Record<string, string> = {}) {
  return {
    name: seed.candidateName || 'there',
    bot: config.persona.name,
    role: seed.role.title || 'this role',
    company: seed.company || config.pdf.companyName,
    minutes: Math.round(config.interview.durationLimitSeconds / 60),
    location: seed.role.location || 'the location you set',
    ...extra,
  }
}

export function findSnippet(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 40 && line.length <= 180)
  const interesting = lines.find((line) => /\b(led|built|shipped|reduced|improved|designed|launched|owned|migrat)\b/i.test(line) || /\d/.test(line))
  return (interesting ?? lines[0] ?? '').replace(/\s+/g, ' ')
}

export function buildTailoredQuestions(seed: InterviewSeed, config: HiringConfig): string[] {
  const templates = config.interview.questionTemplates
  const required = seed.role.requiredSkills
  const matched = required.filter(
    (skill) => skillPresent(seed.cvText, skill) || seed.cvSkills.some((item) => sameSkill(item, skill)),
  )
  const missing = required.filter((skill) => !matched.some((item) => sameSkill(item, skill)))
  const questions: string[] = []
  if (matched[0]) questions.push(fill(templates.matchedSkill, { skill: matched[0] }))
  else questions.push(templates.genericImpact)
  if (matched[1]) questions.push(fill(templates.secondSkill, { skill: matched[1] }))
  else if (missing[0]) questions.push(fill(templates.missingSkill, { skill: missing[0] }))
  const snippet = findSnippet(seed.cvText)
  if (snippet && questions.length < config.interview.flow.tailoredMax) {
    questions.push(fill(templates.impact, { snippet: snippet.slice(0, 140) }))
  }
  return questions.slice(0, config.interview.flow.tailoredMax)
}

export function buildProbeQuestions(seed: InterviewSeed, config: HiringConfig): string[] {
  const skills = [...seed.role.requiredSkills, ...seed.cvSkills].map(canonicalSkill)
  const prompts: string[] = []
  for (const topic of config.interview.probeTopics) {
    if (topic.match === '*') continue
    const hit = skills.some((skill) => sameSkill(skill, topic.match) || skill.includes(canonicalSkill(topic.match)))
    if (!hit) continue
    for (const prompt of topic.prompts) prompts.push(fill(config.interview.questionTemplates.probe, { prompt }))
  }
  if (prompts.length === 0) {
    const fallback = config.interview.probeTopics.find((topic) => topic.match === '*')
    for (const prompt of fallback?.prompts ?? []) prompts.push(fill(config.interview.questionTemplates.probe, { prompt }))
  }
  return prompts.slice(0, config.interview.flow.probesMax)
}

export function buildPlan(seed: InterviewSeed, config: HiringConfig): PlanItem[] {
  const values = varsFor(seed, config)
  const plan: PlanItem[] = []
  config.interview.warmupQuestions.slice(0, config.interview.warmupCount).forEach((question, index) => {
    plan.push({ id: `warmup-${index + 1}`, kind: 'warmup', text: fill(question, values) })
  })
  for (const question of config.mandatoryQuestions) {
    plan.push({ id: question.id, kind: 'mandatory', text: fill(question.prompt, values) })
  }
  if (config.interview.flow.askLogistics) {
    plan.push({
      id: 'logistics',
      kind: 'logistics',
      text: fill(config.interview.flow.logisticsPrompt, values),
    })
  }
  buildTailoredQuestions(seed, config).forEach((question, index) => {
    plan.push({ id: `tailored-${index + 1}`, kind: 'tailored', text: question })
  })
  buildProbeQuestions(seed, config).forEach((question, index) => {
    plan.push({ id: `probe-${index + 1}`, kind: 'probe', text: question })
  })
  if (config.interview.candidateQuestions.allowed) {
    plan.push({
      id: 'candidate-questions',
      kind: 'candidateQuestions',
      text: fill(config.interview.candidateQuestions.prompt, values),
    })
  }
  return plan
}

function msLeft(state: EngineState, now: number, config: HiringConfig, grace: boolean): number {
  const extra = grace && config.interview.capMode === 'soft' ? config.interview.graceSeconds * 1000 : 0
  return state.startedAt + config.interview.durationLimitSeconds * 1000 + extra - now
}

function canAsk(item: PlanItem, state: EngineState, now: number, config: HiringConfig): boolean {
  const hardLeft = msLeft(state, now, config, false)
  const softLeft = msLeft(state, now, config, true)
  if (softLeft <= 0) return false
  if (item.kind === 'warmup' || item.kind === 'mandatory') return true
  if (hardLeft <= 0) return false
  const flow = config.interview.flow
  if (item.kind === 'logistics' && hardLeft < flow.skipLogisticsWhenSecondsLeft * 1000) return false
  if (item.kind === 'tailored' && hardLeft < flow.skipTailoredWhenSecondsLeft * 1000) return false
  if (item.kind === 'probe' && hardLeft < flow.skipProbesWhenSecondsLeft * 1000) return false
  if (item.kind === 'candidateQuestions' && hardLeft < flow.skipCandidateQuestionsWhenSecondsLeft * 1000) return false
  return true
}

function pushTurn(
  state: EngineState,
  turn: Omit<TranscriptTurn, 'offsetMs' | 'at'> & { at: number },
): void {
  state.turns.push({ ...turn, offsetMs: Math.max(0, turn.at - state.startedAt) })
}

function acknowledgement(state: EngineState, config: HiringConfig): string {
  if (!config.persona.useAcknowledgements || config.persona.acknowledgements.length === 0) return ''
  const line = config.persona.acknowledgements[state.answers.length % config.persona.acknowledgements.length] ?? ''
  return line ? `${line} ` : ''
}

function unanswered(state: EngineState): PlanItem[] {
  return state.plan.filter(
    (item) => !state.answers.some((answer) => answer.id === item.id) && !state.missed.some((miss) => miss.id === item.id),
  )
}

function markMissed(state: EngineState, items: PlanItem[]): void {
  for (const item of items) {
    if (state.missed.some((miss) => miss.id === item.id)) continue
    if (state.answers.some((answer) => answer.id === item.id)) continue
    state.missed.push({ id: item.id, question: item.text })
  }
}

function mandatoryMissed(state: EngineState): boolean {
  return state.plan
    .filter((item) => item.kind === 'mandatory')
    .some((item) => !state.answers.some((answer) => answer.id === item.id))
}

function closeWithName(state: EngineState, now: number, config: HiringConfig, seedName: string, because: 'completed' | 'time' | 'left'): EngineStep {
  markMissed(state, unanswered(state))
  const partial = because === 'left' || mandatoryMissed(state)
  const template =
    because === 'time' && config.interview.capMode === 'hard' && partial
      ? config.interview.hardStopMessage
      : partial
        ? config.interview.partialClosingMessage
        : config.interview.closingMessage
  const say = fill(template, { name: seedName || 'there', bot: config.persona.name, company: config.pdf.companyName })
  state.phase = 'done'
  state.closedBecause = because
  state.partial = partial
  pushTurn(state, {
    speaker: 'bot',
    text: say,
    at: now,
    confidence: null,
    source: 'script',
    lowConfidence: false,
    phase: 'closing',
    questionId: null,
  })
  return { state, say, done: true }
}

function ask(state: EngineState, index: number, now: number, config: HiringConfig, prefix: string): EngineStep {
  const item = state.plan[index]
  if (!item) return closeWithName(state, now, config, 'there', 'completed')
  state.index = index
  state.followUps = 0
  state.retries = 0
  const say = `${prefix}${item.text}`.trim()
  pushTurn(state, {
    speaker: 'bot',
    text: say,
    at: now,
    confidence: null,
    source: 'script',
    lowConfidence: false,
    phase: item.kind,
    questionId: item.id,
  })
  return { state, say, done: false }
}

function advance(state: EngineState, now: number, config: HiringConfig, seedName: string, prefix: string): EngineStep {
  const skipped: PlanItem[] = []
  for (let index = state.index + 1; index < state.plan.length; index += 1) {
    const item = state.plan[index]
    if (!item) continue
    if (canAsk(item, state, now, config)) {
      markMissed(state, skipped)
      return ask(state, index, now, config, prefix)
    }
    skipped.push(item)
  }
  markMissed(state, skipped)
  const because = mandatoryMissed(state) ? 'time' : 'completed'
  return closeWithName(state, now, config, seedName, because === 'time' ? 'time' : 'completed')
}

export function createInterview(seed: InterviewSeed, config: HiringConfig, now: number): EngineStep {
  const plan = buildPlan(seed, config)
  const state: EngineState = {
    plan,
    index: 0,
    startedAt: now,
    followUps: 0,
    retries: 0,
    turns: [],
    answers: [],
    missed: [],
    phase: plan.length ? 'question' : 'done',
    closedBecause: null,
    partial: false,
    mode: 'scripted',
    facts: emptyFacts(),
  }
  if (!plan.length) return closeWithName(state, now, config, seed.candidateName, 'completed')
  const first = plan[0]
  if (!first) return closeWithName(state, now, config, seed.candidateName, 'completed')
  const greeting = fill(config.interview.openingGreeting, {
    ...varsFor(seed, config),
    warmup: first.kind === 'warmup' ? first.text : '',
  })
  const includesFirst = first.kind === 'warmup' && greeting.includes(first.text)
  const say = includesFirst ? greeting : `${greeting} ${first.text}`.trim()
  pushTurn(state, {
    speaker: 'bot',
    text: say,
    at: now,
    confidence: null,
    source: 'script',
    lowConfidence: false,
    phase: first.kind,
    questionId: first.id,
  })
  return { state, say, done: false }
}

function upsertAnswer(state: EngineState, item: PlanItem, text: string, append: boolean): void {
  const existing = state.answers.find((answer) => answer.id === item.id)
  if (!existing) {
    state.answers.push({ id: item.id, kind: item.kind, question: item.text, answer: text.trim() })
    return
  }
  existing.answer = append && existing.answer ? `${existing.answer}\n${text.trim()}` : text.trim()
}

export function receiveAnswer(
  state: EngineState,
  input: CandidateInput,
  config: HiringConfig,
  seed: InterviewSeed,
): EngineStep {
  if (state.phase === 'done') return { state, say: null, done: true }
  const item = state.plan[state.index]
  if (!item) return closeWithName(state, input.at, config, seed.candidateName, 'time')
  if (msLeft(state, input.at, config, true) <= 0) {
    if (!isNoise(input.text)) {
      pushTurn(state, {
        speaker: 'candidate',
        text: input.text.trim(),
        at: input.at,
        confidence: input.confidence,
        source: input.source,
        lowConfidence: confidenceIsLow(input.confidence, config),
        phase: item.kind,
        questionId: item.id,
      })
      upsertAnswer(state, item, input.text, false)
      state.facts = mergeFacts(state.facts, extractFactsFromText(input.text, seed.role.requiredSkills))
    }
    return closeWithName(state, input.at, config, seed.candidateName, 'time')
  }

  if (isNoise(input.text)) {
    if (state.retries < config.interview.silence.maxRetries && msLeft(state, input.at, config, false) > 8000) {
      state.retries += 1
      const prompt =
        config.interview.silence.retryPrompts[state.retries - 1] ??
        config.interview.silence.retryPrompts.at(-1) ??
        config.interview.silence.noSpeechPrompt
      pushTurn(state, {
        speaker: 'bot',
        text: prompt,
        at: input.at,
        confidence: null,
        source: 'script',
        lowConfidence: false,
        phase: item.kind,
        questionId: item.id,
      })
      return { state, say: prompt, done: false }
    }
    if (!state.answers.some((answer) => answer.id === item.id)) markMissed(state, [item])
    return advance(state, input.at, config, seed.candidateName, '')
  }

  const lowConfidence = confidenceIsLow(input.confidence, config)
  pushTurn(state, {
    speaker: 'candidate',
    text: input.text.trim(),
    at: input.at,
    confidence: input.confidence,
    source: input.source,
    lowConfidence,
    phase: item.kind,
    questionId: item.id,
  })
  state.facts = mergeFacts(state.facts, extractFactsFromText(input.text, [...seed.role.requiredSkills, ...seed.cvSkills]))
  const existing = state.answers.find((answer) => answer.id === item.id)
  const combined = existing ? `${existing.answer} ${input.text}` : input.text
  const thin = wordCount(combined) < config.interview.followUp.thinAnswerWordThreshold
  const followAllowed =
    config.interview.followUp.appliesTo.includes(item.kind) &&
    state.followUps < config.interview.followUp.maxCount &&
    thin &&
    msLeft(state, input.at, config, false) > 20000
  upsertAnswer(state, item, input.text, Boolean(existing))
  if (followAllowed) {
    state.followUps += 1
    const depth = config.interview.followUp.depth
    const prompt = `${acknowledgement(state, config)}${config.interview.followUp.prompts[depth]}`.trim()
    pushTurn(state, {
      speaker: 'bot',
      text: prompt,
      at: input.at,
      confidence: null,
      source: 'script',
      lowConfidence: false,
      phase: item.kind,
      questionId: item.id,
    })
    return { state, say: prompt, done: false }
  }
  if (
    item.kind === 'logistics' &&
    state.followUps < config.interview.followUp.maxCount &&
    msLeft(state, input.at, config, false) > 20000
  ) {
    const missing = [
      state.facts.yearsExperience == null ? 'years of experience' : '',
      state.facts.expectedCtcValue == null && state.facts.expectedCtc == null ? 'expected pay' : '',
      state.facts.noticeDays == null ? 'notice period' : '',
      state.facts.location == null ? 'location' : '',
    ].filter(Boolean)
    if (missing.length >= 3) {
      state.followUps += 1
      const prompt = fill(config.interview.followUp.logisticsPrompt, { missing: missing.join(', ') })
      pushTurn(state, {
        speaker: 'bot',
        text: prompt,
        at: input.at,
        confidence: null,
        source: 'script',
        lowConfidence: false,
        phase: item.kind,
        questionId: item.id,
      })
      return { state, say: prompt, done: false }
    }
  }
  if (item.kind === 'candidateQuestions') {
    const reply = fill(config.interview.candidateQuestions.reply, varsFor(seed, config))
    const closing = closeWithName(state, input.at, config, seed.candidateName, mandatoryMissed(state) ? 'time' : 'completed')
    const combined = `${reply} ${closing.say ?? ''}`.trim()
    const last = state.turns[state.turns.length - 1]
    if (last?.phase === 'closing') last.text = combined
    return { state, say: combined, done: true }
  }
  return advance(state, input.at, config, seed.candidateName, acknowledgement(state, config))
}

export function forceClose(
  state: EngineState,
  now: number,
  config: HiringConfig,
  seedName: string,
  because: 'time' | 'left',
): EngineStep {
  if (state.phase === 'done') return { state, say: state.turns.at(-1)?.text ?? null, done: true }
  return closeWithName(state, now, config, seedName, because)
}

export function acceptLlmLine(scripted: string, candidate: string): boolean {
  const text = candidate.trim()
  if (!text || text.length > 500) return false
  if (text.includes('```') || /^\s*[-*]\s/m.test(text)) return false
  const questions = text.match(/\?/g)?.length ?? 0
  if (questions > 2) return false
  if (scripted.includes('?') && questions < 1) return false
  return true
}