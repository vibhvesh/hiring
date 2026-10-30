import type { Candidate } from '../config/types.ts'

export type CandidateFilter = 'all' | 'shortlist' | 'maybe' | 'reject' | 'partial' | 'review' | 'unscreened'
export type CandidateSort = 'newest' | 'score' | 'name'

export function candidateScore(candidate: Candidate): number | null {
  return candidate.interviewScore ?? candidate.cvScore
}

export function queryCandidates(
  list: Candidate[],
  options: { q: string; filter: CandidateFilter; sort: CandidateSort },
): Candidate[] {
  const query = options.q.trim().toLowerCase()
  const filtered = list.filter((candidate) => {
    if (query) {
      const haystack = [candidate.name, candidate.email, candidate.skills.join(' '), candidate.fileName]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(query)) return false
    }
    if (options.filter === 'shortlist') return candidate.recommendationKey === 'shortlist'
    if (options.filter === 'maybe') return candidate.recommendationKey === 'maybe'
    if (options.filter === 'reject') return candidate.recommendationKey === 'reject'
    if (options.filter === 'partial') return candidate.partial || candidate.status === 'partial'
    if (options.filter === 'review') return candidate.needsReview
    if (options.filter === 'unscreened') return candidate.interviewScore == null
    return true
  })
  const sorted = [...filtered]
  sorted.sort((left, right) => {
    if (options.sort === 'name') return left.name.localeCompare(right.name)
    if (options.sort === 'score') {
      const a = candidateScore(left)
      const b = candidateScore(right)
      if (a == null && b == null) return right.updatedAt - left.updatedAt
      if (a == null) return 1
      if (b == null) return -1
      return b - a
    }
    return right.updatedAt - left.updatedAt
  })
  return sorted
}

export function paginate<T>(list: T[], page: number, pageSize: number): {
  items: T[]
  page: number
  pages: number
  from: number
  to: number
} {
  const size = Math.max(1, pageSize)
  const pages = Math.max(1, Math.ceil(list.length / size))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * size
  const items = list.slice(start, start + size)
  return {
    items,
    page: current,
    pages,
    from: list.length === 0 ? 0 : start + 1,
    to: start + items.length,
  }
}