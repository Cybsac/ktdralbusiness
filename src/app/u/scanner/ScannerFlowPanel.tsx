'use client';

export default function ScannerFlowPanel({ href, label, onClose }: { href: string; label: string; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-950">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
      <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{label}</h2><a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-700 underline dark:text-teal-300">Abrir aparte</a></div>
      <button type="button" onClick={onClose} className="min-h-11 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white">Seguir escaneando</button>
    </div>
    <iframe title={label} src={href} onLoad={event => {
      try {
        const path = event.currentTarget.contentWindow?.location.pathname;
        if (path === '/u/scanner' || path === '/admin/scanner') onClose();
      } catch { /* An external navigation can be opened separately. */ }
    }} className="min-h-0 w-full flex-1 border-0 bg-white dark:bg-slate-950" />
  </div>;
}
