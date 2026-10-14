/**
 * CSV writing. RFC 4180 quoting: a field containing a comma, quote or
 * newline is wrapped in quotes and its own quotes are doubled.
 */

import { downloadText } from './download'

export type CsvValue = string | number | null | undefined

export function escapeCsv(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

/** Rows, with a header line, joined with CRLF as the spec asks. */
export function toCsv(headers: readonly string[], rows: readonly CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')
}

/**
 * Hands the file to the browser. A leading BOM keeps Excel from mangling
 * the peso sign and any non-ASCII note.
 */
export function downloadCsv(filename: string, csv: string): void {
  downloadText(filename, csv, 'text/csv;charset=utf-8', true)
}
