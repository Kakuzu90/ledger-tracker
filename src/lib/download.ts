/**
 * Handing files to and taking files from the browser. No backend means every
 * export is a download and every restore is a file the user picked.
 */

/** Saves `text` as a file. A BOM keeps Excel from mangling ₱ in a CSV. */
export function downloadText(
  filename: string,
  text: string,
  mime: string,
  bom = false,
): void {
  const blob = new Blob([bom ? `\uFEFF${text}` : text], { type: mime })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, value: unknown): void {
  downloadText(filename, JSON.stringify(value), 'application/json;charset=utf-8')
}

/** Reads a chosen file as text. Backups are JSON, so text is all we need. */
export async function readTextFile(file: File): Promise<string> {
  return file.text()
}
