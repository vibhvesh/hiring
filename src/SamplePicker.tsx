import { useEffect, useState } from 'react'
import { listSamples, loadSample, readUpload, type Sample } from './files.ts'

/** Optional upload + "Use a sample" picker. Calls onText with the file's text. */
export default function SamplePicker({ kind, label, onText }: { kind: Sample['kind']; label: string; onText: (text: string, name: string) => void }) {
  const [samples, setSamples] = useState<Sample[]>([])
  const [status, setStatus] = useState('')
  useEffect(() => { listSamples(kind).then(setSamples).catch(() => setSamples([])) }, [kind])
  return (
    <div className="upload">
      <label className="filebtn">
        {label}
        <input type="file" accept=".txt,.md,.pdf,.docx" onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const text = await readUpload(f)
          setStatus(text ? `Using ${f.name}` : `Couldn't read ${f.name}, that's fine, it's optional.`)
          if (text) onText(text, f.name)
        }} />
      </label>
      <select aria-label="Use a sample" value="" onChange={async (e) => {
        const s = samples.find((x) => x.file === e.target.value)
        if (!s) return
        onText(await loadSample(s.file), s.title)
        setStatus(`Using sample: ${s.title}`)
      }}>
        <option value="">Use a sample…</option>
        {samples.map((s) => <option key={s.file} value={s.file}>{s.title}</option>)}
      </select>
      {status && <p className="muted small">{status}</p>}
    </div>
  )
}
