export interface RetentionItem {
  id: string
  updatedAt: number
}

export function expiredIds(items: RetentionItem[], now: number, retentionDays: number): string[] {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
  return items.filter((item) => item.updatedAt < cutoff).map((item) => item.id)
}

export function abandonCutoff(now: number, abandonMinutes: number): number {
  return now - abandonMinutes * 60 * 1000
}