/**
 * CSV building + download helpers (RFC-4180).
 *
 * The old export path used a `data:text/csv` URI + `encodeURI`, which silently
 * corrupted data: `encodeURI` never escapes `#` (truncating the payload at the
 * first `#`), and fields containing commas / quotes / newlines broke column
 * alignment. This module fixes both: fields are escaped per RFC-4180 and the
 * file is downloaded through a Blob + object URL, which also scales far beyond
 * the practical size limits of data: URIs.
 */

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  get: (row: T) => CsvValue;
}

/** Render a raw value as CSV cell text. Booleans become Yes/No; null/undefined become empty. */
export function formatCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * Escape one field per RFC-4180: if it contains a comma, double quote,
 * carriage return or line feed, wrap it in double quotes and double any
 * internal quotes.
 */
export function escapeCsvField(value: CsvValue): string {
  const text = formatCsvValue(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Build a complete CSV document (CRLF row endings, no BOM). Parse with any
 * RFC-4180 reader to get every row back exactly.
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeCsvField(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsvField(c.get(row))).join(','));
  return [header, ...body].join('\r\n');
}

/**
 * Download a CSV file in the browser. Uses a Blob + object URL (never a
 * data: URI). A UTF-8 BOM is prepended so Excel opens non-ASCII text correctly.
 */
export function exportCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const csv = toCsv(columns, rows);
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Let the download start before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
