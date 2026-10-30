import { escapeRegExp } from './text.ts'

const ALIASES: Record<string, string> = {
  'react.js': 'react',
  reactjs: 'react',
  nodejs: 'node.js',
  node: 'node.js',
  'node js': 'node.js',
  k8s: 'kubernetes',
  golang: 'go',
  postgres: 'postgresql',
  tf: 'terraform',
  js: 'javascript',
  ts: 'typescript',
  nextjs: 'next.js',
  vuejs: 'vue',
  'vue.js': 'vue',
  sklearn: 'scikit-learn',
  'ci/cd': 'cicd',
  'ci cd': 'cicd',
  'amazon web services': 'aws',
  'google cloud': 'gcp',
  csharp: 'c#',
  'c sharp': 'c#',
  dotnet: '.net',
  'dot net': '.net',
}

export const KNOWN_SKILLS = [
  'javascript',
  'typescript',
  'react',
  'next.js',
  'vue',
  'angular',
  'node.js',
  'express',
  'python',
  'django',
  'flask',
  'fastapi',
  'java',
  'spring',
  'kotlin',
  'go',
  'rust',
  'c#',
  '.net',
  'c++',
  'ruby',
  'rails',
  'php',
  'laravel',
  'sql',
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
  'graphql',
  'docker',
  'kubernetes',
  'aws',
  'gcp',
  'azure',
  'terraform',
  'ansible',
  'linux',
  'git',
  'cicd',
  'html',
  'css',
  'sass',
  'tailwind',
  'jest',
  'cypress',
  'playwright',
  'pandas',
  'pytorch',
  'tensorflow',
  'spark',
  'kafka',
  'react native',
  'flutter',
  'swift',
  'android',
  'figma',
  'security',
  'oauth',
]

export function canonicalSkill(input: string): string {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, ' ')
  return ALIASES[cleaned] ?? cleaned
}

export function sameSkill(left: string, right: string): boolean {
  return canonicalSkill(left) === canonicalSkill(right)
}

function formsFor(skill: string): string[] {
  const canon = canonicalSkill(skill)
  const forms = new Set<string>([canon, skill.trim().toLowerCase()])
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (target === canon) forms.add(alias)
  }
  return [...forms].filter(Boolean)
}

function matchesForm(text: string, form: string): boolean {
  if (form.includes(' ')) return text.toLowerCase().includes(form)
  if (form.includes('.')) return text.toLowerCase().includes(form)
  const pattern =
    form.length <= 3 || /[^a-z0-9.+#-]/i.test(form)
      ? new RegExp(`(^|[^a-z0-9])${escapeRegExp(form)}([^a-z0-9]|$)`, 'i')
      : new RegExp(`\\b${escapeRegExp(form)}\\b`, 'i')
  return pattern.test(text)
}

export function skillPresent(text: string, skill: string): boolean {
  if (!skill.trim() || !text.trim()) return false
  return formsFor(skill).some((form) => matchesForm(text, form))
}

export function extractSkills(text: string, extra: string[] = []): string[] {
  const found = new Set<string>()
  for (const skill of [...KNOWN_SKILLS, ...extra]) {
    if (skillPresent(text, skill)) found.add(canonicalSkill(skill))
  }
  return [...found]
}

export function parseSkillList(value: string): string[] {
  const seen = new Set<string>()
  const skills: string[] = []
  for (const part of value.split(/[,;\n]/)) {
    const skill = canonicalSkill(part)
    if (!skill || seen.has(skill)) continue
    seen.add(skill)
    skills.push(skill)
  }
  return skills
}