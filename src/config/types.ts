export interface PersonaConfig {
  name: string
  tone: string
  useAcknowledgements: boolean
  acknowledgements: string[]
  systemPrompt: string
}

export interface FollowUpConfig {
  maxCount: number
  depth: 'light' | 'medium' | 'deep'
  tone: string
  thinAnswerWordThreshold: number
  prompts: { light: string; medium: string; deep: string }
  appliesTo: string[]
  logisticsPrompt: string
}

export interface ProbeTopic {
  match: string
  prompts: string[]
}

export interface InterviewConfig {
  durationLimitSeconds: number
  capMode: 'hard' | 'soft'
  graceSeconds: number
  openingGreeting: string
  closingMessage: string
  partialClosingMessage: string
  hardStopMessage: string
  timeWarningSeconds: number
  timeWarningMessage: string
  warmupCount: number
  warmupQuestions: string[]
  languages: string[]
  allowTyping: boolean
  typingHint: string
  candidateQuestions: {
    allowed: boolean
    maxSeconds: number
    prompt: string
    reply: string
  }
  followUp: FollowUpConfig
  flow: {
    tailoredMax: number
    probesMax: number
    askLogistics: boolean
    logisticsPrompt: string
    skipLogisticsWhenSecondsLeft: number
    skipTailoredWhenSecondsLeft: number
    skipProbesWhenSecondsLeft: number
    skipCandidateQuestionsWhenSecondsLeft: number
  }
  probeTopics: ProbeTopic[]
  questionTemplates: {
    matchedSkill: string
    secondSkill: string
    missingSkill: string
    impact: string
    genericImpact: string
    probe: string
  }
  voice: {
    preferredNames: string[]
    lang: string
    rate: number
    pitch: number
    engine: 'browser'
    mixIntoRecording: boolean
  }
  silence: {
    commitSilenceMs: number
    maxListenMs: number
    maxRetries: number
    retryPrompts: string[]
    noSpeechPrompt: string
  }
  asr: {
    lowConfidenceThreshold: number
    treatZeroConfidenceAsUnknown: boolean
    ignoreConfidenceForScoring: boolean
    flagForReview: boolean
    repromptOnLowConfidence: boolean
    whisperModel: string
    offerOfflineTranscription: boolean
  }
}

export interface MandatoryQuestion {
  id: string
  prompt: string
  placeholder: boolean
}

export interface ScoringConfig {
  weights: {
    technicalSkills: number
    experience: number
    communication: number
    noticePeriod: number
    ctcFit: number
    mandatoryQuestions: number
  }
  thresholds: { shortlistMin: number; maybeMin: number }
  stars: { '5': number; '4': number; '3': number; '2': number }
  fitment: {
    ctcOverBudgetRatio: number
    noticePeriodGoodDays: number
    noticePeriodMaxDays: number
    minYearsSlack: number
    substantiveWordCount: number
    mandatoryMinWords: number
    communicationTargetWords: number
    unknownExperienceScore: number
    unknownNoticeScore: number
    unknownCtcScore: number
    partialMinCoverage: number
  }
  cv: {
    shortlistScore: number
    minSkillCoverage: number
    weights: { skills: number; experience: number; location: number; keywords: number }
    unknownExperiencePoints: number
    remoteLocationPoints: number
    relocateLocationPoints: number
    mismatchLocationPoints: number
    emptyLocationPoints: number
    emptyKeywordPoints: number
  }
  redFlags: {
    enableCtcOverBudget: boolean
    enableLongNotice: boolean
    enableLowCommunication: boolean
    enableMissingMandatory: boolean
    lowCommunicationBelow: number
    blockShortlistOnMajor: boolean
  }
  reasonTemplates: Record<string, string>
  redFlagTemplates: Record<string, string>
  reviewFlagTemplate: string
}

export interface RecommendationStyle {
  label: string
  color: string
  summary: string
}

export interface HiringConfig {
  version: string
  appName: string
  persona: PersonaConfig
  interview: InterviewConfig
  mandatoryQuestions: MandatoryQuestion[]
  scoring: ScoringConfig
  recommendations: {
    shortlist: RecommendationStyle
    maybe: RecommendationStyle
    reject: RecommendationStyle
    partial: RecommendationStyle
  }
  pdf: {
    companyName: string
    logoDataUrl: string
    footer: string
    accentColor: string
    partialBanner: string
    notProvidedText: string
    showRubricVersion: boolean
    showTranscriptAppendix: boolean
    maxTranscriptChars: number
    truncationNote: string
  }
  notifications: {
    inDashboard: boolean
    dashboardAlertTitle: string
    mailto: string
    emailSubject: string
    emailBody: string
    emailjs: { enabled: boolean; serviceId: string; templateId: string; publicKey: string }
    webhookUrl: string
    webhookIncludeTranscript: boolean
  }
  privacy: {
    retentionDays: number
    autoPurge: boolean
    abandonMinutes: number
    consentTitle: string
    consentBody: string
    consentCheckbox: string
    consentDeclineText: string
  }
  recording: {
    enabled: boolean
    requireCamera: boolean
    allowContinueWithoutCamera: boolean
    videoBitsPerSecond: number
    audioBitsPerSecond: number
    width: number
    height: number
    frameRate: number
    mimePreference: string[]
    timesliceMs: number
    captionOnVideo: boolean
    mixBotVoice: boolean
    hint: string
  }
  dashboard: {
    pageSize: number
    defaultSort: 'newest' | 'score' | 'name'
    defaultFilter: 'all' | 'shortlist' | 'maybe' | 'reject' | 'partial' | 'review' | 'unscreened'
    showCvScoreWhenUnscreened: boolean
  }
  links: { codeLength: number; shareMessage: string }
  storage: { googleDrive: { enabled: boolean; clientId: string; folderName: string } }
  llm: {
    enabled: boolean
    autoStart: boolean
    modelId: string
    fallbackModelId: string
    timeoutMs: number
    temperature: number
    maxTokens: number
  }
  roleForm: {
    currencies: string[]
    defaultCurrency: string
    defaultMinYears: number
    titlePlaceholder: string
    skillsPlaceholder: string
    skillsHelp: string
    budgetHelp: string
    remoteLabel: string
    locationPlaceholder: string
  }
  copy: Record<string, string>
}

export type RecommendationKey = 'shortlist' | 'maybe' | 'reject' | 'partial'

export interface RoleProfile {
  id: string
  title: string
  requiredSkills: string[]
  niceToHaveSkills: string[]
  minYears: number
  location: string
  remoteOk: boolean
  currency: string
  budgetMin: number | null
  budgetMax: number | null
  description: string
  updatedAt: number
}

export interface TranscriptTurn {
  speaker: 'bot' | 'candidate'
  text: string
  at: number
  offsetMs: number
  confidence: number | null
  source: 'speech' | 'typed' | 'script'
  lowConfidence: boolean
  phase: string
  questionId: string | null
}

export interface CandidateAnswer {
  id: string
  kind: string
  question: string
  answer: string
}

export interface CriterionScore {
  key: string
  label: string
  score: number
  weight: number
  weighted: number
  detail: string
}

export interface ScreenResult {
  candidateId: string
  candidateName: string
  roleTitle: string
  rubricVersion: string
  startedAt: number
  endedAt: number
  durationMs: number
  partial: boolean
  closedBecause: 'completed' | 'time' | 'left'
  covered: CandidateAnswer[]
  missed: { id: string; question: string }[]
  transcript: TranscriptTurn[]
  summary: string
  breakdown: CriterionScore[]
  total: number
  stars: number
  recommendationKey: RecommendationKey
  recommendationLabel: string
  reasons: string[]
  redFlags: string[]
  reviewFlags: string[]
  skills: string[]
  yearsExperience: number | null
  currentCtc: string | null
  expectedCtc: string | null
  noticePeriod: string | null
  noticeDays: number | null
  location: string | null
  relocation: string | null
  communicationRating: number
  mode: 'scripted' | 'on-device'
  lowConfidenceCount: number
  recordingMime: string | null
}

export type CandidateStatus = 'new' | 'invited' | 'in_progress' | 'complete' | 'partial'

export interface Candidate {
  id: string
  linkCode: string
  name: string
  email: string
  phone: string
  fileName: string
  cvText: string
  skills: string[]
  yearsExperience: number | null
  location: string
  currentCtc: string | null
  education: string
  cvScore: number | null
  cvShortlisted: boolean
  cvNotes: string[]
  matchedSkills: string[]
  missingSkills: string[]
  tailoredQuestions: string[]
  roleSnapshot: RoleProfile | null
  status: CandidateStatus
  interviewScore: number | null
  stars: number | null
  recommendationKey: RecommendationKey | null
  recommendationLabel: string | null
  partial: boolean
  needsReview: boolean
  hasVideo: boolean
  rubricVersion: string | null
  createdAt: number
  updatedAt: number
}

export interface RubricRecord {
  version: string
  savedAt: number
  config: HiringConfig
}

export interface AlertRecord {
  id: string
  candidateId: string
  title: string
  body: string
  createdAt: number
  read: boolean
}