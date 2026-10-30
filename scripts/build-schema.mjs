import { readFileSync, writeFileSync } from 'node:fs'

const config = JSON.parse(readFileSync('config/hiring.config.json', 'utf8'))

const HELP = {
  version: 'Score rules version. Stamped on every report so older screens stay comparable.',
  appName: 'Name shown in the header.',
  'persona.name': 'What the bot calls itself.',
  'persona.tone': 'How the bot should sound. Used when on-device phrasing is available.',
  'persona.useAcknowledgements': 'Say a short thanks before the next question.',
  'persona.acknowledgements': 'Short phrases rotated between questions. One per line in settings.',
  'persona.systemPrompt': 'Instructions for the optional on-device model. The guided script is used if the model is unavailable.',
  'interview.durationLimitSeconds': 'How long a screen may last, in seconds. 300 is five minutes.',
  'interview.capMode': 'Hard stops at the limit. Soft finishes the current thought and allows the grace period.',
  'interview.graceSeconds': 'Extra seconds after the limit when the cap is soft.',
  'interview.openingGreeting': 'First thing the bot says. Use {name}, {bot}, {role}, {company}, {minutes}, and {warmup}.',
  'interview.closingMessage': 'Said when the screen finishes normally. Use {name}.',
  'interview.partialClosingMessage': 'Said when the screen ends early. Use {name}.',
  'interview.hardStopMessage': 'Said when a hard cap cuts the screen off. Use {name}.',
  'interview.timeWarningSeconds': 'When to show the "time is almost up" note, in seconds left.',
  'interview.timeWarningMessage': 'The note shown when time is almost up.',
  'interview.warmupCount': 'How many opening questions to ask before your mandatory questions. Two is the usual.',
  'interview.warmupQuestions': 'Opening questions, asked before your mandatory questions.',
  'interview.languages': 'Languages the candidate can be interviewed in. The selected voice language should be one of these.',
  'interview.allowTyping': 'Let the candidate type an answer if speech recognition fails.',
  'interview.typingHint': 'Shown above the answer box.',
  'interview.candidateQuestions.allowed': 'Leave time for the candidate to ask something.',
  'interview.candidateQuestions.maxSeconds': 'How much time to keep for the candidate\'s own question.',
  'interview.candidateQuestions.prompt': 'How the bot invites their question.',
  'interview.candidateQuestions.reply': 'What the bot says back. It should not invent an offer.',
  'interview.followUp.maxCount': 'How many follow-up questions to ask when an answer is very short.',
  'interview.followUp.depth': 'Light, medium, or deep. This picks the follow-up wording.',
  'interview.followUp.tone': 'A note about the follow-up style, for you and for the optional on-device model.',
  'interview.followUp.thinAnswerWordThreshold': 'Answers shorter than this many words can get a follow-up.',
  'interview.followUp.appliesTo': 'Which parts of the screen may get a follow-up. Mandatory questions are usually left out so the answer stays verbatim.',
  'interview.followUp.logisticsPrompt': 'Asked if pay, notice, or location was missing. Use {missing}.',
  'interview.flow.tailoredMax': 'How many CV-specific questions to ask after your mandatory questions, if time allows.',
  'interview.flow.probesMax': 'How many deeper skill questions to ask if time allows.',
  'interview.flow.askLogistics': 'Ask years, pay, notice period, and location.',
  'interview.flow.logisticsPrompt': 'The practical question. Use {location}.',
  'interview.flow.skipLogisticsWhenSecondsLeft': 'Skip the practical question when fewer than this many seconds remain.',
  'interview.flow.skipTailoredWhenSecondsLeft': 'Skip CV-specific questions when fewer than this many seconds remain.',
  'interview.flow.skipProbesWhenSecondsLeft': 'Skip deeper questions when fewer than this many seconds remain.',
  'interview.flow.skipCandidateQuestionsWhenSecondsLeft': 'Skip the candidate\'s question when fewer than this many seconds remain.',
  'interview.probeTopics': 'Deeper questions by skill. Use * as the fallback. Match is a skill name.',
  'interview.voice.preferredNames': 'Browser voice names to try, in order.',
  'interview.voice.lang': 'Language passed to speech recognition and the browser voice.',
  'interview.voice.rate': 'Speech rate. 1 is normal. Slightly under 1 sounds calmer.',
  'interview.voice.pitch': 'Voice pitch. 1 is normal.',
  'interview.voice.engine': 'browser uses the free built-in voice.',
  'interview.voice.mixIntoRecording': 'Try to include the bot in the recording. Browsers cannot capture the built-in voice directly.',
  'interview.silence.commitSilenceMs': 'How long to wait after the candidate stops talking before taking the answer.',
  'interview.silence.maxListenMs': 'Stop listening after this many milliseconds and ask them to continue.',
  'interview.silence.maxRetries': 'How many times to ask again when nothing was heard.',
  'interview.silence.retryPrompts': 'What to say when nothing was heard.',
  'interview.silence.noSpeechPrompt': 'Shown when the microphone stays quiet.',
  'interview.asr.lowConfidenceThreshold': 'Below this confidence (0 to 1), a line is flagged for a person to check. A score of 0 is treated as unknown, not low.',
  'interview.asr.treatZeroConfidenceAsUnknown': 'Chrome often reports 0 when it has no confidence value. Leave this on so those lines are not flagged.',
  'interview.asr.ignoreConfidenceForScoring': 'Do not lower the communication score because recognition was unsure. Accents are not a penalty.',
  'interview.asr.flagForReview': 'Mark unsure lines for a person to read.',
  'interview.asr.repromptOnLowConfidence': 'Ask the candidate to repeat a line only because recognition was unsure. Off by default.',
  'interview.asr.whisperModel': 'Free on-device model used only if they choose offline transcription.',
  'interview.asr.offerOfflineTranscription': 'Show the offline transcription button when the browser has no speech recognition.',
  'mandatoryQuestions': 'Questions every candidate is asked, after the opening questions and before anything else.',
  'scoring.weights.technicalSkills': 'Relative weight for technical skills.',
  'scoring.weights.experience': 'Relative weight for experience.',
  'scoring.weights.communication': 'Relative weight for communication. Recognition confidence is not part of this.',
  'scoring.weights.noticePeriod': 'Relative weight for notice period.',
  'scoring.weights.ctcFit': 'Relative weight for pay fit.',
  'scoring.weights.mandatoryQuestions': 'Relative weight for your mandatory questions.',
  'scoring.thresholds.shortlistMin': 'Score needed for Shortlist, if there is no blocking issue.',
  'scoring.thresholds.maybeMin': 'Score needed for Maybe. Below this is Reject.',
  'scoring.stars.5': 'Minimum score for 5 stars.',
  'scoring.stars.4': 'Minimum score for 4 stars.',
  'scoring.stars.3': 'Minimum score for 3 stars.',
  'scoring.stars.2': 'Minimum score for 2 stars. Below this is 1 star.',
  'scoring.fitment.ctcOverBudgetRatio': 'Expected pay above budget times this number is a red flag. 1.15 means 15% over.',
  'scoring.fitment.noticePeriodGoodDays': 'Notice at or under this many days scores full marks.',
  'scoring.fitment.noticePeriodMaxDays': 'Notice longer than this is a poor fit.',
  'scoring.fitment.minYearsSlack': 'Years within this many of the minimum still score well.',
  'scoring.fitment.partialMinCoverage': 'If fewer than this fraction of your questions were answered, the recommendation stays Partial.',
  'scoring.cv.shortlistScore': 'CV match needed before someone is marked as a CV shortlist.',
  'pdf.companyName': 'Company name on the PDF.',
  'pdf.logoDataUrl': 'Optional logo as a data URL. Leave empty for none.',
  'pdf.footer': 'Footer on every PDF page.',
  'pdf.accentColor': 'Report colour as #RRGGBB.',
  'pdf.partialBanner': 'Banner on reports that ended early.',
  'pdf.notProvidedText': 'Shown when a field was never answered.',
  'pdf.maxTranscriptChars': 'Long transcripts are cut here so the PDF still builds.',
  'recommendations.shortlist.label': 'Word used for a strong recommendation.',
  'recommendations.shortlist.color': 'Colour for Shortlist, as #RRGGBB.',
  'recommendations.maybe.label': 'Word used for a mixed recommendation.',
  'recommendations.maybe.color': 'Colour for Maybe.',
  'recommendations.reject.label': 'Word used when they do not meet the bar.',
  'recommendations.reject.color': 'Colour for Reject.',
  'recommendations.partial.label': 'Word used when the screen ended early and too little was covered.',
  'recommendations.partial.color': 'Colour for Partial.',
  'notifications.inDashboard': 'Show an alert on the candidate list when a screen is ready.',
  'notifications.mailto': 'Recruiter email. Used only to open a draft. Nothing is sent automatically.',
  'notifications.emailSubject': 'Subject for that draft. Use {name}, {role}, {score}, {recommendation}.',
  'notifications.emailBody': 'Body for that draft.',
  'notifications.emailjs.enabled': 'Turn on EmailJS. The free tier sends a short note, not the video.',
  'notifications.emailjs.serviceId': 'EmailJS service id.',
  'notifications.emailjs.templateId': 'EmailJS template id.',
  'notifications.emailjs.publicKey': 'EmailJS public key.',
  'notifications.webhookUrl': 'Optional address that receives the result JSON. Leave empty to disable.',
  'notifications.webhookIncludeTranscript': 'Include the transcript in the webhook. The video is never included.',
  'privacy.retentionDays': 'Delete screens older than this many days from this browser.',
  'privacy.autoPurge': 'Delete old screens automatically when you open the app.',
  'privacy.abandonMinutes': 'If someone leaves and does not return within this many minutes, make a partial report.',
  'privacy.consentTitle': 'Title on the consent screen.',
  'privacy.consentBody': 'Consent text the candidate must read.',
  'privacy.consentCheckbox': 'The checkbox label.',
  'privacy.consentDeclineText': 'Shown under the checkbox.',
  'recording.enabled': 'Record camera and microphone during the screen.',
  'recording.requireCamera': 'If on, they cannot start without a camera. Leave off so a failed camera does not trap them.',
  'recording.allowContinueWithoutCamera': 'Offer to continue without video if the camera is blocked.',
  'recording.videoBitsPerSecond': 'Video bitrate. Lower keeps files smaller. 280000 is about 10 MB for five minutes.',
  'recording.audioBitsPerSecond': 'Audio bitrate.',
  'recording.mimePreference': 'Recording formats to try, in order. Safari often needs video/mp4.',
  'recording.captionOnVideo': 'Write the current line onto the video.',
  'recording.mixBotVoice': 'Mix microphone audio, and bot audio when a mixable voice is available, into the file.',
  'recording.hint': 'Shown next to the camera request.',
  'dashboard.pageSize': 'How many people to show on one page.',
  'dashboard.defaultSort': 'newest, score, or name.',
  'dashboard.defaultFilter': 'Starting filter on the candidate list.',
  'links.codeLength': 'Length of the readable short code.',
  'links.shareMessage': 'Text used for WhatsApp, email, and the share button. Use {name}, {role}, {minutes}.',
  'storage.googleDrive.enabled': 'Show the Google Drive upload button.',
  'storage.googleDrive.clientId': 'Free Google OAuth client id. Leave empty to hide Drive upload.',
  'storage.googleDrive.folderName': 'Name used for the uploaded file group.',
  'llm.enabled': 'Allow the free in-browser model to rephrase questions.',
  'llm.autoStart': 'Start loading the model when an interview opens. The screen never waits for it.',
  'llm.modelId': 'WebLLM model id. Llama-3.2-1B-Instruct-q4f16_1-MLC is the default.',
  'llm.fallbackModelId': 'A smaller model tried if the first one fails. Qwen2.5-0.5B-Instruct-q4f16_1-MLC is the default.',
  'llm.timeoutMs': 'How long to wait for a rephrase before using the script.',
  'roleForm.defaultCurrency': 'Currency selected on a new role.',
  'roleForm.skillsHelp': 'Help under the skills field.',
  'roleForm.budgetHelp': 'Help under the budget fields.',
  'roleForm.remoteLabel': 'Label for the remote checkbox.',
}

function desc(path) {
  if (!path) return 'Hiring settings.'
  if (path === 'copy' || path.startsWith('copy.')) return HELP[path] ?? 'Words people see in the app.'
  return HELP[path] ?? `Configurable value (${path}). Change it here instead of in code.`
}

function schemaFor(value, path) {
  const description = desc(path)
  if (Array.isArray(value)) {
    return {
      type: 'array',
      description,
      items: value.length ? schemaFor(value[0], `${path}[]`) : {},
    }
  }
  if (value && typeof value === 'object') {
    const properties = {}
    const required = []
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key
      properties[key] = schemaFor(child, childPath)
      required.push(key)
    }
    const loose = path === 'copy' || path.endsWith('reasonTemplates') || path.endsWith('redFlagTemplates')
    return {
      type: 'object',
      description,
      additionalProperties: loose ? { type: 'string' } : false,
      required,
      properties,
    }
  }
  if (typeof value === 'number') return { type: 'number', description }
  if (typeof value === 'boolean') return { type: 'boolean', description }
  if (value === null) return { type: 'null', description }
  return { type: 'string', description }
}

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://hiring.local/config/hiring.config.schema.json',
  title: 'Hiring config',
  description: 'Every tunable for the voice screen. Invalid values fall back to safe defaults.',
  ...schemaFor(config, ''),
}

writeFileSync('config/hiring.config.schema.json', `${JSON.stringify(schema, null, 2)}\n`)

const flat = {}
function walk(node, path) {
  if (!node || typeof node !== 'object') return
  if (path) flat[path] = node.description ?? ''
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) walk(child, path ? `${path}.${key}` : key)
  }
}
walk(schema, '')
writeFileSync('config/descriptions.json', `${JSON.stringify(flat, null, 2)}\n`)
console.log(`schema keys ${Object.keys(flat).length}`)