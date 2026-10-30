import { SHIPPED } from './shipped.ts'
import type { HiringConfig, MandatoryQuestion, ProbeTopic } from './types.ts'

const RANGES: Record<string, { min: number; max: number }> = {
  'interview.durationLimitSeconds': { min: 60, max: 3600 },
  'interview.graceSeconds': { min: 0, max: 180 },
  'interview.timeWarningSeconds': { min: 0, max: 600 },
  'interview.warmupCount': { min: 0, max: 4 },
  'interview.candidateQuestions.maxSeconds': { min: 0, max: 180 },
  'interview.followUp.maxCount': { min: 0, max: 3 },
  'interview.followUp.thinAnswerWordThreshold': { min: 1, max: 80 },
  'interview.flow.tailoredMax': { min: 0, max: 5 },
  'interview.flow.probesMax': { min: 0, max: 4 },
  'interview.flow.skipLogisticsWhenSecondsLeft': { min: 0, max: 300 },
  'interview.flow.skipTailoredWhenSecondsLeft': { min: 0, max: 300 },
  'interview.flow.skipProbesWhenSecondsLeft': { min: 0, max: 300 },
  'interview.flow.skipCandidateQuestionsWhenSecondsLeft': { min: 0, max: 300 },
  'interview.voice.rate': { min: 0.5, max: 1.5 },
  'interview.voice.pitch': { min: 0.5, max: 2 },
  'interview.silence.commitSilenceMs': { min: 400, max: 10000 },
  'interview.silence.maxListenMs': { min: 5000, max: 180000 },
  'interview.silence.maxRetries': { min: 0, max: 3 },
  'interview.asr.lowConfidenceThreshold': { min: 0, max: 1 },
  'scoring.weights.technicalSkills': { min: 0, max: 100 },
  'scoring.weights.experience': { min: 0, max: 100 },
  'scoring.weights.communication': { min: 0, max: 100 },
  'scoring.weights.noticePeriod': { min: 0, max: 100 },
  'scoring.weights.ctcFit': { min: 0, max: 100 },
  'scoring.weights.mandatoryQuestions': { min: 0, max: 100 },
  'scoring.thresholds.shortlistMin': { min: 0, max: 100 },
  'scoring.thresholds.maybeMin': { min: 0, max: 100 },
  'scoring.stars.5': { min: 0, max: 100 },
  'scoring.stars.4': { min: 0, max: 100 },
  'scoring.stars.3': { min: 0, max: 100 },
  'scoring.stars.2': { min: 0, max: 100 },
  'scoring.fitment.ctcOverBudgetRatio': { min: 1, max: 3 },
  'scoring.fitment.noticePeriodGoodDays': { min: 0, max: 365 },
  'scoring.fitment.noticePeriodMaxDays': { min: 0, max: 365 },
  'scoring.fitment.minYearsSlack': { min: 0, max: 10 },
  'scoring.fitment.substantiveWordCount': { min: 1, max: 80 },
  'scoring.fitment.mandatoryMinWords': { min: 1, max: 80 },
  'scoring.fitment.communicationTargetWords': { min: 5, max: 80 },
  'scoring.fitment.unknownExperienceScore': { min: 0, max: 100 },
  'scoring.fitment.unknownNoticeScore': { min: 0, max: 100 },
  'scoring.fitment.unknownCtcScore': { min: 0, max: 100 },
  'scoring.fitment.partialMinCoverage': { min: 0, max: 1 },
  'scoring.cv.shortlistScore': { min: 0, max: 100 },
  'scoring.cv.minSkillCoverage': { min: 0, max: 1 },
  'scoring.cv.weights.skills': { min: 0, max: 100 },
  'scoring.cv.weights.experience': { min: 0, max: 100 },
  'scoring.cv.weights.location': { min: 0, max: 100 },
  'scoring.cv.weights.keywords': { min: 0, max: 100 },
  'scoring.redFlags.lowCommunicationBelow': { min: 0, max: 100 },
  'privacy.retentionDays': { min: 1, max: 3650 },
  'privacy.abandonMinutes': { min: 1, max: 1440 },
  'recording.videoBitsPerSecond': { min: 50000, max: 2000000 },
  'recording.audioBitsPerSecond': { min: 8000, max: 128000 },
  'recording.width': { min: 160, max: 1280 },
  'recording.height': { min: 120, max: 720 },
  'recording.frameRate': { min: 5, max: 30 },
  'recording.timesliceMs': { min: 500, max: 10000 },
  'dashboard.pageSize': { min: 5, max: 100 },
  'links.codeLength': { min: 6, max: 12 },
  'llm.timeoutMs': { min: 500, max: 20000 },
  'llm.temperature': { min: 0, max: 1.5 },
  'llm.maxTokens': { min: 16, max: 512 },
  'roleForm.defaultMinYears': { min: 0, max: 40 },
  'pdf.maxTranscriptChars': { min: 1000, max: 200000 },
}

const ENUMS: Record<string, string[]> = {
  'interview.capMode': ['hard', 'soft'],
  'interview.followUp.depth': ['light', 'medium', 'deep'],
  'interview.voice.engine': ['browser'],
  'dashboard.defaultSort': ['newest', 'score', 'name'],
  'dashboard.defaultFilter': ['all', 'shortlist', 'maybe', 'reject', 'partial', 'review', 'unscreened'],
}

const NONEMPTY = new Set([
  'version',
  'appName',
  'persona.name',
  'interview.openingGreeting',
  'interview.closingMessage',
  'interview.partialClosingMessage',
  'pdf.companyName',
  'pdf.notProvidedText',
])

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function merge(base: unknown, input: unknown, path: string, warnings: string[]): unknown {
  if (Array.isArray(base)) {
    if (input === undefined) return structuredClone(base)
    if (!Array.isArray(input)) {
      warnings.push(`${path} was not a list, so the default was kept.`)
      return structuredClone(base)
    }
    return structuredClone(input)
  }
  if (isObject(base)) {
    const source = isObject(input) ? input : {}
    if (input !== undefined && !isObject(input)) {
      warnings.push(`${path || 'settings'} was not a group, so the default was kept.`)
    }
    const output: Record<string, unknown> = {}
    for (const key of Object.keys(base)) {
      const child = path ? `${path}.${key}` : key
      output[key] = merge(base[key], source[key], child, warnings)
    }
    if (path === 'copy') {
      for (const [key, value] of Object.entries(source)) {
        if (!(key in output) && typeof value === 'string') output[key] = value
      }
    }
    return output
  }
  if (input === undefined) return base
  if (typeof base === 'number') {
    const numeric = typeof input === 'number' ? input : Number(input)
    if (!Number.isFinite(numeric)) {
      warnings.push(`${path} was not a number, so the default was kept.`)
      return base
    }
    const range = RANGES[path]
    if (range && (numeric < range.min || numeric > range.max)) {
      const clamped = Math.min(range.max, Math.max(range.min, numeric))
      warnings.push(`${path} was outside ${range.min}–${range.max} and was set to ${clamped}.`)
      return clamped
    }
    return numeric
  }
  if (typeof base === 'boolean') {
    if (typeof input !== 'boolean') {
      warnings.push(`${path} was not yes or no, so the default was kept.`)
      return base
    }
    return input
  }
  if (typeof base === 'string') {
    if (typeof input !== 'string') {
      warnings.push(`${path} was not text, so the default was kept.`)
      return base
    }
    const allowed = ENUMS[path]
    if (allowed && !allowed.includes(input)) {
      warnings.push(`${path} must be one of: ${allowed.join(', ')}. The default was kept.`)
      return base
    }
    if (NONEMPTY.has(path) && input.trim() === '') {
      warnings.push(`${path} was empty, so the default was kept.`)
      return base
    }
    return input
  }
  return base
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  return items.length ? items.map((item) => item.trim()) : [...fallback]
}

function repairQuestions(value: unknown, fallback: MandatoryQuestion[], warnings: string[]): MandatoryQuestion[] {
  if (!Array.isArray(value) || value.length === 0) {
    warnings.push('Your questions were missing, so the placeholders were kept.')
    return structuredClone(fallback)
  }
  const questions: MandatoryQuestion[] = []
  for (const item of value) {
    if (!isObject(item)) continue
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
    if (!prompt) continue
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `question-${questions.length + 1}`
    const placeholder = typeof item.placeholder === 'boolean' ? item.placeholder : /\[replace/i.test(prompt)
    questions.push({ id, prompt, placeholder })
  }
  if (questions.length === 0) {
    warnings.push('Your questions were empty, so the placeholders were kept.')
    return structuredClone(fallback)
  }
  return questions
}

function repairTopics(value: unknown, fallback: ProbeTopic[]): ProbeTopic[] {
  if (!Array.isArray(value)) return structuredClone(fallback)
  const topics: ProbeTopic[] = []
  for (const item of value) {
    if (!isObject(item)) continue
    const match = typeof item.match === 'string' ? item.match.trim() : ''
    const prompts = Array.isArray(item.prompts)
      ? item.prompts.filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim() !== '')
      : []
    if (!match || prompts.length === 0) continue
    topics.push({ match, prompts: prompts.map((prompt) => prompt.trim()) })
  }
  return topics.length ? topics : structuredClone(fallback)
}

export function applyConfig(
  input: unknown,
  base: HiringConfig = SHIPPED,
): { config: HiringConfig; warnings: string[] } {
  const warnings: string[] = []
  if (!isObject(input)) {
    warnings.push('Settings were unreadable, so the defaults were kept.')
    return { config: structuredClone(base), warnings }
  }
  const merged = merge(base, input, '', warnings) as HiringConfig
  merged.mandatoryQuestions = repairQuestions(input.mandatoryQuestions, base.mandatoryQuestions, warnings)
  merged.interview.probeTopics = repairTopics(input.interview && isObject(input.interview) ? (input.interview as { probeTopics?: unknown }).probeTopics : undefined, base.interview.probeTopics)
  merged.interview.warmupQuestions = stringList(
    isObject(input.interview) ? (input.interview as { warmupQuestions?: unknown }).warmupQuestions : undefined,
    base.interview.warmupQuestions,
  )
  merged.interview.languages = stringList(
    isObject(input.interview) ? (input.interview as { languages?: unknown }).languages : undefined,
    base.interview.languages,
  )
  merged.interview.voice.preferredNames = stringList(merged.interview.voice.preferredNames, base.interview.voice.preferredNames)
  merged.interview.silence.retryPrompts = stringList(merged.interview.silence.retryPrompts, base.interview.silence.retryPrompts)
  merged.persona.acknowledgements = stringList(merged.persona.acknowledgements, base.persona.acknowledgements)
  merged.recording.mimePreference = stringList(merged.recording.mimePreference, base.recording.mimePreference)
  merged.roleForm.currencies = stringList(merged.roleForm.currencies, base.roleForm.currencies)
  if (!merged.interview.languages.includes(merged.interview.voice.lang)) {
    merged.interview.languages = [merged.interview.voice.lang, ...merged.interview.languages]
  }
  if (merged.scoring.thresholds.maybeMin > merged.scoring.thresholds.shortlistMin) {
    warnings.push('Maybe was higher than Shortlist, so Maybe was lowered to match.')
    merged.scoring.thresholds.maybeMin = merged.scoring.thresholds.shortlistMin
  }
  const stars = merged.scoring.stars
  if (!(stars['5'] >= stars['4'] && stars['4'] >= stars['3'] && stars['3'] >= stars['2'])) {
    warnings.push('Star cutoffs were out of order, so the defaults were kept.')
    merged.scoring.stars = structuredClone(base.scoring.stars)
  }
  return { config: merged, warnings }
}