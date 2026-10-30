import { useEffect, useState } from 'react'
import { config } from './config.ts'
import { inviteUrl } from './link.ts'
import { loadProfiles, newId } from './profiles.ts'
import { download, makePdf, profileLine, readZip, transcriptText, type Stored } from './report.ts'
import { deleteCandidate, listCandidates, putCandidate } from './store.ts'

const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {})

export default function Recruiter() {
  const profiles = loadProfiles()
  const [pid, setPid] = useState(profiles[0]?.id ?? '')
  const [count, setCount] = useState<number>(config.defaultLinkCount)
  const [links, setLinks] = useState<string[]>([])
  const [copied, setCopied] = useState('')
  const [cands, setCands] = useState<Stored[]>([])
  const [open, setOpen] = useState('')
  const [msg, setMsg] = useState('')
  const refresh = () => listCandidates().then(setCands).catch(() => setCands([]))
  useEffect(() => { refresh() }, [])

  const create = () => {
    const p = profiles.find((x) => x.id === pid)
    if (!p) return
    const n = Math.max(1, Math.min(50, Math.round(count) || 1))
    setLinks(Array.from({ length: n }, () => inviteUrl(location.href, { id: newId(), profile: p })))
    setCopied('')
  }
  const doCopy = (t: string, key: string) => { copy(t); setCopied(key); setTimeout(() => setCopied(''), 1500) }

  return (
    <main>
      <section className="card">
        <h2>Create interview links</h2>
        <div className="row">
          <label className="grow">Interview profile
            <select value={pid} onChange={(e) => setPid(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.role} · {p.difficulty}</option>)}
            </select>
          </label>
          <label className="narrow">Links
            <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
        </div>
        <button className="primary" onClick={create}>Create links</button>
        {links.length > 0 && (
          <>
            <ul className="links">
              {links.map((l, i) => (
                <li key={l}>
                  <span className="mono">Link {i + 1}</span>
                  <input readOnly value={l} onFocus={(e) => e.target.select()} aria-label={`Link ${i + 1}`} />
                  <button onClick={() => doCopy(l, String(i))}>{copied === String(i) ? 'Copied' : 'Copy'}</button>
                </li>
              ))}
            </ul>
            <button onClick={() => doCopy(links.join('\n'), 'all')}>{copied === 'all' ? 'Copied all' : 'Copy all'}</button>
          </>
        )}
      </section>

      <section className="card">
        <div className="row between">
          <h2>Candidates</h2>
          <label className="filebtn">Import results (.zip)
            <input type="file" accept=".zip" multiple onChange={async (e) => {
              const files = [...(e.target.files ?? [])]
              const errs: string[] = []
              for (const f of files) {
                try { await putCandidate(await readZip(f)) } catch (err) { errs.push(`${f.name}: ${(err as Error).message}`) }
              }
              setMsg(errs.length ? errs.join(' ') : `Imported ${files.length} file(s).`)
              e.target.value = ''
              refresh()
            }} />
          </label>
        </div>
        {msg && <p className="muted small">{msg}</p>}
        {cands.length === 0 && <p className="muted">No candidates yet. When a candidate finishes, they download a results zip and send it to you. Import it here.</p>}
        <ul className="cands">
          {cands.map((c) => {
            const r = c.result
            return (
              <li key={c.id}>
                <button className="candrow" onClick={() => setOpen(open === c.id ? '' : c.id)} aria-expanded={open === c.id}>
                  <span className="score">{r.score.total}</span>
                  <span className="grow"><b>{r.candidateName}</b>{!r.complete && <em className="tag">partial</em>}<br /><span className="muted small">{r.profile.role} · {r.score.verdict}</span></span>
                </button>
                {open === c.id && (
                  <div className="detail">
                    <p>{r.score.recommendation}</p>
                    <p><b>Profile:</b> {profileLine(r)}</p>
                    {r.score.notes.map((n) => <p key={n} className="muted small">{n}</p>)}
                    {c.video && <video controls src={URL.createObjectURL(c.video)} />}
                    <details><summary>Transcript</summary><pre>{transcriptText(r)}</pre></details>
                    <div className="row">
                      <button onClick={() => download(makePdf(r), `report-${r.candidateName}.pdf`)}>Download PDF</button>
                      {c.video && <button onClick={() => download(c.video!, `recording-${r.candidateName}.webm`)}>Download video</button>}
                      <button className="quiet" onClick={async () => { if (confirm('Remove this candidate from this browser?')) { await deleteCandidate(c.id); refresh() } }}>Remove</button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
