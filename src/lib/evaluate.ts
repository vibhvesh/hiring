import type {
  CriterionScore,
  HiringConfig,
  RecommendationKey,
  RoleProfile,
  ScreenResult,
} from '../config/types.ts'
import { canonicalSkill, sameSkill, skillPresent } from './skills.ts'
import { fill, wordCount } from './text.ts'
import type { EngineState, InterviewSeed } from './interview.ts'

export function starsFor(score: number, stars: HiringConfig['scoring']['stars']): number {
  if (score >= stars['5']) return 5
  if (score >= stars['4']) return 4
  if (score >= stars['3']) return 3
  if (score >= stars['2']) return 2
  return 1
}

export function scoreCommunication(answers: string[], targetWords: number, substantiveWords: number): number {
  const cleaned = answers.map((answer) => answer.trim()).filter((answer) => answer.length > 0)
  if (cleaned.length === 0) return 0
  const counts = cleaned.map(wordCount)
  const average = counts.reduce((sum, count) => sum + count, 0) / counts.length
  const ratio = Math.min(1, average / Math.max(1, targetWords))
  const substantive = counts.filter((count) => count >= substantiveWords).length / counts.length
  return Math.round(ratio * 70 + substantive * 30)
}

export function scoreTechnical(required: string[], cvText: string, cvSkills: string[], answerText: string): number {
  if (required.length === 0) return 70
  const inBackground = required.filter(
    (skill) => skillPresent(`${cvText}\n${answerText}`, skill) || cvSkills.some((item) => sameSkill(item, skill)),
  )
  const inAnswers = required.filter((skill) => skillPresent(answerText, skill))
  return Math.round((inBackground.length / required.length) * 40 + (inAnswers.length / required.length) * 60)
}

export function scoreExperience(
  years: number | null,
  minYears: number,
  slack: number,
  unknown: number,
): number {
  if (years == null) return unknown
  if (minYears <= 0 || years >= minYears) return 100
  if (years >= minYears - slack) return 75
  if (years >= minYears * 0.5) return 45
  return 20
}

export function scoreNotice(days: number | null, goodDays: number, maxDays: number, unknown: number): number {
  if (days == null) return unknown
  if (days <= goodDays) return 100
  if (days <= maxDays) return 70
  return 25
}

export function scoreCtc(
  expected: number | null,
  budgetMin: number | null,
  budgetMax: number | null,
  overRatio: number,
  unknown: number,
): number {
  if (expected == null) return unknown
  if (budgetMax == null && budgetMin == null) return 80
  if (budgetMin != null && budgetMax != null && expected >= budgetMin && expected <= budgetMax) return 100
  if (budgetMax != null && expected <= budgetMax) return 100
  if (budgetMax != null && expected <= budgetMax * overRatio) return 60
  if (budgetMax != null && expected > budgetMax * overRatio) return 20
  if (budgetMin != null && expected < budgetMin) return 85
  return 80
}

export function scoreMandatory(
  questions: { id: string }[],
  answers: { id: string; answer: string }[],
  minWords: number,
): number {
  if (questions.length === 0) return 100
  const total = questions.reduce((sum, question) => {
    const answer = answers.find((item) => item.id === question.id)?.answer ?? ''
    const words = wordCount(answer)
    if (!answer.trim()) return sum
    if (words >= minWords) return sum + 100
    if (words > 0) return sum + 40
    return sum
  }, 0)
  return Math.round(total / questions.length)
}

function weightShare(weights: HiringConfig['scoring']['weights']): number {
  return Object.values(weights).reduce((sum, value) => sum + value, 0)
}

export function evaluateScreen(args: {
  config: HiringConfig
  seed: InterviewSeed
  state: EngineState
  endedAt: number
  recordingMime?: string | null
}): ScreenResult {
  const { config, seed, state } = args
  const role: RoleProfile = seed.role
  const fit = config.scoring.fitment
  const weights = config.scoring.weights
  const answerText = state.answers.map((answer) => answer.answer).join('\n')
  const candidateAnswers = state.turns.filter((turn) => turn.speaker === 'candidate').map((turn) => turn.text)
  const years = state.facts.yearsExperience ?? null
  const technical = scoreTechnical(role.requiredSkills, seed.cvText, seed.cvSkills, answerText)
  const experience = scoreExperience(years, role.minYears, fit.minYearsSlack, fit.unknownExperienceScore)
  const communication = scoreCommunication(
    candidateAnswers,
    fit.communicationTargetWords,
    fit.substantiveWordCount,
  )
  const notice = scoreNotice(
    state.facts.noticeDays,
    fit.noticePeriodGoodDays,
    fit.noticePeriodMaxDays,
    fit.unknownNoticeScore,
  )
  const ctc = scoreCtc(
    state.facts.expectedCtcValue,
    role.budgetMin,
    role.budgetMax,
    fit.ctcOverBudgetRatio,
    fit.unknownCtcScore,
  )
  const mandatoryQuestions = state.plan.filter((item) => item.kind === 'mandatory')
  const mandatory = scoreMandatory(mandatoryQuestions, state.answers, fit.mandatoryMinWords)
  const rows: { key: keyof typeof weights; label: string; score: number; detail: string }[] = [
    {
      key: 'technicalSkills',
      label: config.copy.technicalSkills ?? 'Technical skills',
      score: technical,
      detail: technicalDetail(role.requiredSkills, seed, answerText),
    },
    {
      key: 'experience',
      label: config.copy.experience ?? 'Experience',
      score: experience,
      detail:
        years == null
          ? 'No clear number of years.'
          : `${years} years, against a minimum of ${role.minYears}.`,
    },
    {
      key: 'communication',
      label: config.copy.communication ?? 'Communication',
      score: communication,
      detail: 'Based on how complete the answers were. Speech-recognition confidence is not used.',
    },
    {
      key: 'noticePeriod',
      label: config.copy.noticePeriod ?? 'Notice period',
      score: notice,
      detail: state.facts.noticePeriod ? state.facts.noticePeriod : 'Not said.',
    },
    {
      key: 'ctcFit',
      label: config.copy.payFit ?? 'Pay fit',
      score: ctc,
      detail: payDetail(state.facts.currentCtc, state.facts.expectedCtc, role),
    },
    {
      key: 'mandatoryQuestions',
      label: config.copy.yourQuestions ?? 'Your questions',
      score: mandatory,
      detail: mandatoryDetail(mandatoryQuestions.length, state),
    },
  ]
  const share = weightShare(weights)
  const breakdown: CriterionScore[] = rows.map((row) => ({
    key: row.key,
    label: row.label,
    score: row.score,
    weight: weights[row.key],
    weighted: share > 0 ? Math.round((row.score * weights[row.key] * 10) / share) / 10 : 0,
    detail: row.detail,
  }))
  const total = share > 0 ? Math.round(rows.reduce((sum, row) => sum + row.score * weights[row.key], 0) / share) : 0
  const stars = starsFor(total, config.scoring.stars)
  const matched = role.requiredSkills.filter((skill) => skillPresent(`${seed.cvText}\n${answerText}`, skill))
  const answeredMandatory = mandatoryQuestions.filter((item) =>
    state.answers.some((answer) => answer.id === item.id && answer.answer.trim()),
  ).length
  const coverage = mandatoryQuestions.length === 0 ? 1 : answeredMandatory / mandatoryQuestions.length
  const redFlags: string[] = []
  const major: string[] = []
  const templates = config.scoring.redFlagTemplates
  if (
    config.scoring.redFlags.enableCtcOverBudget &&
    state.facts.expectedCtcValue != null &&
    role.budgetMax != null &&
    state.facts.expectedCtcValue > role.budgetMax * fit.ctcOverBudgetRatio
  ) {
    redFlags.push(templates.payHigh ?? 'Expected pay is above the budget.')
    major.push('pay')
  }
  if (
    config.scoring.redFlags.enableLongNotice &&
    state.facts.noticeDays != null &&
    state.facts.noticeDays > fit.noticePeriodMaxDays
  ) {
    redFlags.push(fill(templates.noticeLong ?? 'Notice period is longer than {max} days.', { max: fit.noticePeriodMaxDays }))
  }
  if (config.scoring.redFlags.enableLowCommunication && communication < config.scoring.redFlags.lowCommunicationBelow) {
    redFlags.push(templates.communicationThin ?? 'Answers were very short.')
    major.push('communication')
  }
  const missedMandatory = mandatoryQuestions.length - answeredMandatory
  if (config.scoring.redFlags.enableMissingMandatory && missedMandatory > 0) {
    redFlags.push(fill(templates.mandatoryMissed ?? '{count} required questions were not answered.', { count: missedMandatory }))
    major.push('mandatory')
  }
  const reasons = buildReasons(config, {
    matched: matched.length,
    totalSkills: role.requiredSkills.length,
    years,
    minYears: role.minYears,
    ctcScore: ctc,
    expectedKnown: state.facts.expectedCtcValue != null || Boolean(state.facts.expectedCtc),
    noticeScore: notice,
    noticeKnown: state.facts.noticeDays != null,
    communication,
    missedMandatory,
    partial: state.partial,
    skippedOptional: state.missed.some((item) => !item.id.startsWith('warmup') && !mandatoryQuestions.some((q) => q.id === item.id)),
  })
  let recommendationKey: RecommendationKey
  if (state.partial && coverage < fit.partialMinCoverage) recommendationKey = 'partial'
  else if (
    total >= config.scoring.thresholds.shortlistMin &&
    (!config.scoring.redFlags.blockShortlistOnMajor || major.length === 0)
  ) {
    recommendationKey = 'shortlist'
  } else if (total >= config.scoring.thresholds.maybeMin) recommendationKey = 'maybe'
  else recommendationKey = 'reject'
  const style = config.recommendations[recommendationKey]
  const reviewFlags = state.turns
    .filter((turn) => turn.lowConfidence)
    .map((turn) =>
      fill(config.scoring.reviewFlagTemplate, {
        question: turn.questionId ? (state.plan.find((item) => item.id === turn.questionId)?.text ?? turn.questionId) : 'an answer',
        confidence: turn.confidence == null ? 'unknown' : turn.confidence.toFixed(2),
      }),
    )
  const skills = [...new Set([...seed.cvSkills.map(canonicalSkill), ...state.facts.skillsMentioned])]
  const summary = [
    `${seed.candidateName || 'The candidate'} screened for ${role.title || 'the role'}.`,
    `Score ${total} out of 100, ${stars} of 5 stars.`,
    `${style.label}.`,
    reasons.join(' '),
  ].join(' ')
  return {
    candidateId: '',
    candidateName: seed.candidateName,
    roleTitle: role.title,
    rubricVersion: config.version,
    startedAt: state.startedAt,
    endedAt: args.endedAt,
    durationMs: Math.max(0, args.endedAt - state.startedAt),
    partial: state.partial,
    closedBecause: state.closedBecause ?? 'left',
    covered: state.answers.map((answer) => ({ ...answer })),
    missed: state.missed.map((item) => ({ ...item })),
    transcript: state.turns.map((turn) => ({ ...turn })),
    summary,
    breakdown,
    total,
    stars,
    recommendationKey,
    recommendationLabel: style.label,
    reasons,
    redFlags,
    reviewFlags,
    skills,
    yearsExperience: years,
    currentCtc: state.facts.currentCtc,
    expectedCtc: state.facts.expectedCtc,
    noticePeriod: state.facts.noticePeriod,
    noticeDays: state.facts.noticeDays,
    location: state.facts.location,
    relocation: state.facts.relocation,
    communicationRating: starsFor(communication, config.scoring.stars),
    mode: state.mode,
    lowConfidenceCount: state.turns.filter((turn) => turn.lowConfidence).length,
    recordingMime: args.recordingMime ?? null,
  }
}

function technicalDetail(required: string[], seed: InterviewSeed, answerText: string): string {
  if (required.length === 0) return 'No required skills were set.'
  const matched = required.filter((skill) => skillPresent(`${seed.cvText}\n${answerText}`, skill))
  return `${matched.length} of ${required.length} required skills showed up.`
}

function payDetail(current: string | null, expected: string | null, role: RoleProfile): string {
  const budget =
    role.budgetMin != null || role.budgetMax != null
      ? `Budget ${role.budgetMin ?? '—'}–${role.budgetMax ?? '—'} ${role.currency}.`
      : 'No budget was set.'
  return `Now: ${current ?? 'not said'}. Hoping for: ${expected ?? 'not said'}. ${budget}`
}

function mandatoryDetail(total: number, state: EngineState): string {
  const answered = state.answers.filter((answer) => answer.kind === 'mandatory' && answer.answer.trim()).length
  return `${answered} of ${total} answered in their own words.`
}

function buildReasons(
  config: HiringConfig,
  facts: {
    matched: number
    totalSkills: number
    years: number | null
    minYears: number
    ctcScore: number
    expectedKnown: boolean
    noticeScore: number
    noticeKnown: boolean
    communication: number
    missedMandatory: number
    partial: boolean
    skippedOptional: boolean
  },
): string[] {
  const t = config.scoring.reasonTemplates
  const reasons: string[] = []
  if (facts.totalSkills > 0) {
    reasons.push(
      fill(facts.matched / facts.totalSkills >= 0.6 ? (t.strongSkills ?? '') : (t.weakSkills ?? ''), {
        matched: facts.matched,
        total: facts.totalSkills,
      }),
    )
  }
  if (facts.years == null) reasons.push(t.experienceUnknown ?? '')
  else if (facts.years >= facts.minYears) reasons.push(fill(t.experienceOk ?? '', { min: facts.minYears }))
  else reasons.push(fill(t.experienceLow ?? '', { min: facts.minYears }))
  if (!facts.expectedKnown) reasons.push(t.payUnknown ?? '')
  else if (facts.ctcScore >= 80) reasons.push(t.payOk ?? '')
  else if (facts.ctcScore <= 20) reasons.push(t.payHigh ?? '')
  if (!facts.noticeKnown) reasons.push(t.noticeUnknown ?? '')
  else if (facts.noticeScore >= 70) reasons.push(t.noticeOk ?? '')
  else reasons.push(t.noticeLong ?? '')
  if (facts.communication >= 70) reasons.push(t.communicationStrong ?? '')
  else if (facts.communication < config.scoring.redFlags.lowCommunicationBelow) reasons.push(t.communicationThin ?? '')
  if (facts.missedMandatory > 0) reasons.push(fill(t.mandatoryMissed ?? '', { count: facts.missedMandatory }))
  else reasons.push(t.mandatoryGood ?? '')
  if (facts.partial) reasons.push(t.partial ?? '')
  else if (facts.skippedOptional) reasons.push(t.optionalSkipped ?? '')
  return reasons.map((reason) => reason.trim()).filter(Boolean)
}