export function LandingFooter() {
  return (
    <footer className="border-t border-slate-800/80 py-8 px-4 sm:px-8 text-xs font-mono text-slate-500 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className="font-display font-bold text-slate-300 text-sm">KAIO</span>
        <span>— Kanban AI Orchestration Platform</span>
      </div>
      <div>
        <span>Deepgram Nova-3 • Playwright Bot • WebSockets • httpOnly Auth</span>
      </div>
    </footer>
  );
}
