import { dialog, net, type BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'

// CANOPY-REPORTS-AS-FILES-1 item 4 — real Windows-side export: a native Save dialog
// (dialog.showSaveDialog), then the actual PDF bytes written to wherever the owner chooses, via
// Electron's net.fetch (same shared-session client api.ts already uses) — so the file can be
// emailed, printed, or backed up outside Canopy entirely, not trapped inside it. No new PDF
// generation here; pdfUrl is always a real, already-produced Vercel Blob URL from the existing
// deliverable/weekly-report pipelines (see src/lib/aria/canopy-reports.ts on the main app side).
export interface ExportReportResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export async function exportReportToWindows(
  parentWindow: BrowserWindow | null,
  pdfUrl: string,
  suggestedName: string,
): Promise<ExportReportResult> {
  const dialogOpts = {
    title: 'Export report',
    defaultPath: suggestedName.endsWith('.pdf') ? suggestedName : suggestedName + '.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  }
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, dialogOpts)
    : await dialog.showSaveDialog(dialogOpts)
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }

  try {
    const res = await net.fetch(pdfUrl)
    if (!res.ok) return { ok: false, error: 'Download failed (' + res.status + ')' }
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(result.filePath, buf)
    return { ok: true, path: result.filePath }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
