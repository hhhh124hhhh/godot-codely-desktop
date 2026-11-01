export interface ProgressEntry {
  ts: string
  task: string
  status: string
  message: string
}

export function parseEntryLine(line: string): ProgressEntry | null
export function formatReportLines(entries: ProgressEntry[], now?: Date): string[]
export function readNewEntries(content: string, cursorOffset: number): ProgressEntry[]
