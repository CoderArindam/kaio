import {
  Radio,
  FileSpreadsheet,
  Command,
  Columns3,
  BarChart3,
  ShieldCheck,
} from "lucide-react";

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="py-20 px-4 sm:px-8 border-t border-slate-800/80 bg-[#0b0f19]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-sans text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Engineered for Enterprise Execution
          </h2>
          <p className="text-slate-400 mt-3 text-sm sm:text-base font-sans">
            Beyond speech-to-text: full workflow orchestration built into a single workspace.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-[#1f2937] border border-[#374151] rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3 text-emerald-400">
              <Radio className="w-5 h-5 animate-pulse" />
              <h3 className="font-sans text-base font-bold text-white">Real-Time WebSockets</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Live task status updates, comment threads, and notifications push instantly to all active workspace sessions with visual status pulses.
            </p>
          </div>

          <div className="bg-[#1f2937] border border-[#374151] rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3 text-blue-400">
              <FileSpreadsheet className="w-5 h-5" />
              <h3 className="font-sans text-base font-bold text-white">Enterprise Timesheets</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Weekly effort grid with lock policy, multi-level approval workflows, export capabilities, and compliance reporting built right in.
            </p>
          </div>

          <div className="bg-[#1f2937] border border-[#374151] rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3 text-indigo-400">
              <Command className="w-5 h-5" />
              <h3 className="font-sans text-base font-bold text-white">Global Cmd+K Search</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Sub-millisecond global search index across tasks, meeting recordings, raw transcripts, boards, and team member assignments.
            </p>
          </div>

          <div className="bg-[#1f2937] border border-[#374151] rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3 text-amber-400">
              <Columns3 className="w-5 h-5" />
              <h3 className="font-sans text-base font-bold text-white">Full Kanban Board</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Powered by <code className="text-amber-400 font-mono text-[11px]">@dnd-kit</code>. Drag-and-drop columns, subtasks, custom priorities, due dates, attachments, and filter presets.
            </p>
          </div>

          <div className="bg-[#1f2937] border border-[#374151] rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3 text-purple-400">
              <BarChart3 className="w-5 h-5" />
              <h3 className="font-sans text-base font-bold text-white">Manager Dashboard</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Organizational KPIs, board completion percentages, pending proposal queues, and active meeting monitors in one pane.
            </p>
          </div>

          <div className="bg-[#1f2937] border border-[#374151] rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="font-sans text-base font-bold text-white">Security Event Audit Log</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Comprehensive immutable logging of authentication events, role modifications, session revocations, and data exports.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
