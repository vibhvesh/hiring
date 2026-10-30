export function t(
  config: { copy: Record<string, string> },
  key: string,
  vars?: Record<string, string | number | null | undefined>,
): string {
  return fill(config.copy[key] ?? key, vars ?? {})
}

export function fill(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  })
}

export function wordCount(text: string): number {
  const matches = text.trim().match(/\S+/g)
  return matches ? matches.length : 0
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

export function listPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }
  const paths: string[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      paths.push(...listPaths(child, path))
    } else {
      paths.push(path)
    }
  }
  return paths
}

export function getPath(source: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = source
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function setPath<T>(source: T, path: string, value: unknown): T {
  const clone = structuredClone(source) as Record<string, unknown>
  const parts = path.split('.')
  let current: Record<string, unknown> = clone
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i] ?? ''
    const next = current[part]
    if (next == null || typeof next !== 'object') return source
    current = next as Record<string, unknown>
  }
  const last = parts[parts.length - 1]
  if (last) current[last] = value
  return clone as T
}

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match?.[1]) return [35, 66, 55]
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function formatClock(msRemaining: number): string {
  const total = Math.max(0, Math.ceil(msRemaining / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function sanitizePdfText(input: unknown): string {
  if (input == null) return ''
  return String(input)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
}

export function textOr(input: unknown, fallback: string): string {
  const clean = sanitizePdfText(input).trim()
  return clean || fallback
}

export function bumpVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version.trim())
  if (!match) return `${version}.1`
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}${match[4] ?? ''}`
}

export function nextConfigVersion<T extends { version: string }>(previous: T, next: T): T {
  if (previous.version !== next.version) return next
  const prevBody = { ...previous, version: '' }
  const nextBody = { ...next, version: '' }
  if (stableStringify(prevBody) === stableStringify(nextBody)) return next
  return { ...next, version: bumpVersion(previous.version) }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function safeFileName(value: string, fallback = 'candidate'): string {
  const clean = value
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return clean.slice(0, 80) || fallback
}