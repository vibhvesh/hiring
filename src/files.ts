export interface Sample { file: string; title: string; kind: 'resume' | 'jd' }

export const samplesUrl = (f = '') => `${import.meta.env.BASE_URL}samples/${f}`

export async function listSamples(kind: Sample['kind']): Promise<Sample[]> {
  const res = await fetch(samplesUrl('index.json'))
  const all = (await res.json()) as Sample[]
  return all.filter((s) => s.kind === kind)
}

export async function loadSample(file: string): Promise<string> {
  return (await fetch(samplesUrl(file))).text()
}

/** Read text out of .txt/.md/.pdf/.docx. Returns '' on failure; uploads are always optional. */
export async function readUpload(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  try {
    if (name.endsWith('.pdf')) {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
      let text = ''
      for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
        const c = await (await doc.getPage(i)).getTextContent()
        text += c.items.map((x) => ('str' in x ? x.str : '')).join(' ') + '\n'
      }
      return text
    }
    if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth')
      return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value
    }
    return await file.text()
  } catch {
    return ''
  }
}
