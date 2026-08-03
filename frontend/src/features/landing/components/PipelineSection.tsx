import { Bot, Users, Mic, Cpu, Sparkles, CheckSquare, Activity } from "lucide-react";

const PIPELINE_STAGES = [
  {
    step: "01",
    title: "Zero-Touch Bot Join",
    icon: Bot,
    iconColor: "text-blue-400",
    desc: "Playwright bot automatically joins scheduled Google Meet links and silently records tab audio stream.",
  },
  {
    step: "02",
    title: "Live Presence Tracking",
    icon: Users,
    iconColor: "text-indigo-400",
    desc: "Chrome extension monitors Google Meet roster events in real time (joins, leaves, renames, host handoffs).",
  },
  {
    step: "03",
    title: "Nova-3 Diarization",
    icon: Mic,
    iconColor: "text-purple-400",
    desc: "Deepgram Nova-3 delivers atomic speech-to-text with precise speaker turn segmentation in a single pass.",
  },
  {
    step: "04",
    title: "Weighted Speaker Attribution",
    icon: Cpu,
    iconColor: "text-amber-400",
    desc: "Heuristic engine correlates roster presence with diarized speech turns to conclusively attribute who said what.",
  },
  {
    step: "05",
    title: "AI Task Extraction",
    icon: Sparkles,
    iconColor: "text-rose-400",
    desc: "LLM parses the attributed transcript, drafting proposals with title, priority, due date, owner, and source quote.",
  },
  {
    step: "06",
    title: "Manager Approval Queue",
    icon: CheckSquare,
    iconColor: "text-emerald-400",
    desc: "Managers review, edit, approve, or reject proposals before they convert into active Kanban cards.",
  },
];

export function PipelineSection() {
  return (
    <section id="pipeline" className="py-20 px-4 sm:px-8 border-t border-slate-800/80 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-blue-400 mb-4">
          <Activity className="w-3.5 h-3.5" />
          <span>HOW KAIO ACTUALLY WORKS</span>
        </div>
        <h2 className="font-sans text-3xl sm:text-4xl font-bold text-white tracking-tight">
          The 6-Stage Meeting-to-Task Pipeline
        </h2>
        <p className="text-slate-400 mt-3 text-sm sm:text-base font-sans">
          From silent bot join to manager-approved Kanban cards in 6 deterministic steps.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PIPELINE_STAGES.map((s) => (
          <div
            key={s.step}
            className="bg-[#1f2937] border border-[#374151] p-6 rounded-2xl space-y-4 hover:border-slate-600 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-slate-400 px-2 py-1 bg-slate-900 rounded border border-slate-700/60">
                STAGE {s.step}
              </span>
              <s.icon className={`w-6 h-6 ${s.iconColor} group-hover:scale-110 transition-transform`} />
            </div>
            <h3 className="font-sans text-lg font-bold text-white">{s.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
