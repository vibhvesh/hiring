export function pickMime(preference: string[], supported: (mime: string) => boolean): string {
  return preference.find((mime) => supported(mime)) ?? ''
}

export function extensionForMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4'
  return 'webm'
}