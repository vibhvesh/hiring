function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Google sign-in.'))
    document.head.append(script)
  })
}

export async function uploadToDrive(blob: Blob, fileName: string, clientId: string): Promise<void> {
  if (!clientId.trim()) throw new Error('Add a Google client id in Settings first.')
  await loadScript('https://accounts.google.com/gsi/client')
  const google = window.google
  if (!google) throw new Error('Google sign-in did not load.')
  const token = await new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.access_token) resolve(response.access_token)
        else reject(new Error(response.error || 'Google sign-in was cancelled.'))
      },
    })
    client.requestAccessToken()
  })
  const body = new FormData()
  body.append('metadata', new Blob([JSON.stringify({ name: fileName, mimeType: blob.type || 'application/zip' })], { type: 'application/json' }))
  body.append('file', blob, fileName)
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
  if (!response.ok) throw new Error('Google Drive did not accept the file.')
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
          }) => { requestAccessToken: () => void }
        }
      }
    }
  }
}