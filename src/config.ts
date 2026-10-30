// The only settings file. Keep it short: wording and timing.
export const config = {
  appName: 'Hiring',
  maxMinutes: 5,
  defaultLinkCount: 5,
  recruiterName: 'Maya',
  opening:
    "Hi{name}! I'm Maya, and I'll be running a short five-minute chat with you today. Let's start. Tell me about yourself, the technologies you've worked with, and your work experience.",
  askYears: 'Thanks! How many years of work experience do you have in total?',
  askRole: "Got it. What's your current role or job title?",
  askStack: 'And which technologies do you use most in your day-to-day work?',
  askWhatToFix: 'No problem. What should I correct: your years, your role, or your technologies?',
  askYesNo: 'Just to check, is that right? A simple yes or no is fine.',
  toMandatory: "Perfect, thanks for confirming. I have a few questions for this role.",
  toTechnical: 'Great. Now a few technical questions, based on your experience.',
  followUp: {
    Medium: 'Could you add a bit more detail, maybe a quick example?',
    Hard: 'Go one level deeper for me: how did you actually do that, and why that way?',
    Tough: 'Be specific: what trade-offs did you weigh, and what would break first in production?',
  },
  acks: ['Thanks.', 'Got it.', 'Nice, thank you.', 'Okay, makes sense.', 'Great.'],
  outOfTime: "We're right at our time limit, so let's wrap up there.",
  closing:
    "That's everything from me. Thank you{name}, it was lovely talking with you. The recruiter will review this and get back to you soon. Have a great day!",
  silenceSeconds: 3,
  lowConfidence: 0.6,
  voiceNames: ['Google UK English Female', 'Samantha', 'Aria', 'Jenny', 'Natural', 'Google US English'],
  useWebLLM: false,
} as const

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Tough'
export const difficulties: Difficulty[] = ['Easy', 'Medium', 'Hard', 'Tough']
