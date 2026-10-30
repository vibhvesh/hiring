import type { Stored } from './report.ts'

// Tiny IndexedDB wrapper for imported candidate results (videos can be large).
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('hiring', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('candidates', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction('candidates', mode).objectStore('candidates'))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export const listCandidates = async () =>
  (await tx<Stored[]>('readonly', (s) => s.getAll() as IDBRequest<Stored[]>)).sort((a, b) => b.result.startedAt.localeCompare(a.result.startedAt))
export const putCandidate = (c: Stored) => tx('readwrite', (s) => s.put(c))
export const deleteCandidate = (id: string) => tx('readwrite', (s) => s.delete(id))
