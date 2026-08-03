import { useState } from "react";
import {
  Activity,
  Radio,
  Users,
  Mic,
  Cpu,
  UserCheck,
  Clock,
  CheckCircle2,
  Zap,
} from "lucide-react";

export interface Scenario {
  id: string;
  title: string;
  meetUrl: string;
  duration: string;
  activeRoster: Array<{ name: string; role: string; avatar: string; color: string }>;
  speechTurn: {
    timestamp: string;
    speaker: string;
    speakerColor: string;
    text: string;
  };
  proposal: {
    title: string;
    priority: "HIGH" | "CRITICAL" | "MEDIUM";
    suggestedAssignee: string;
    confidence: number;
    dueDate: string;
    sourceQuote: string;
  };
}

export const DEMO_SCENARIOS: Scenario[] = [
  {
    id: "scenario-1",
    title: "Security & Cookie Auth Sync",
    meetUrl: "meet.google.com/sec-auth-kaio",
    duration: "14:32",
    activeRoster: [
      { name: "Sarah Jenkins", role: "SecOps Lead", avatar: "SJ", color: "bg-blue-600 text-white" },
      { name: "Alex Rivera", role: "Backend Architect", avatar: "AR", color: "bg-indigo-600 text-white" },
      { name: "Marcus Chen", role: "Engineering Manager", avatar: "MC", color: "bg-emerald-600 text-white" },
    ],
    speechTurn: {
      timestamp: "04:18.2",
      speaker: "Sarah Jenkins",
      speakerColor: "text-blue-400",
      text: "We need to switch from local storage tokens to httpOnly cookie JWTs before Friday's security audit.",
    },
    proposal: {
      title: "Migrate Auth Tokens to httpOnly Cookies with Strict SameSite Policy",
      priority: "CRITICAL",
      suggestedAssignee: "Alex Rivera",
      confidence: 96,
      dueDate: "In 3 days",
      sourceQuote: '"We need to switch from local storage tokens to httpOnly cookie JWTs before Friday\'s security audit."',
    },
  },
  {
    id: "scenario-2",
    title: "Frontend Refactor & Timesheets",
    meetUrl: "meet.google.com/fe-sprint-sync",
    duration: "22:05",
    activeRoster: [
      { name: "David Kim", role: "Staff Frontend Eng", avatar: "DK", color: "bg-amber-600 text-white" },
      { name: "Elena Rostova", role: "Product Manager", avatar: "ER", color: "bg-rose-600 text-white" },
    ],
    speechTurn: {
      timestamp: "12:04.9",
      speaker: "David Kim",
      speakerColor: "text-amber-400",
      text: "I will implement row locking on the weekly enterprise timesheet grid by tomorrow afternoon.",
    },
    proposal: {
      title: "Add Row Locking & Approval Workflow to Enterprise Timesheets",
      priority: "HIGH",
      suggestedAssignee: "David Kim",
      confidence: 94,
      dueDate: "Tomorrow, 5 PM",
      sourceQuote: '"I will implement row locking on the weekly enterprise timesheet grid by tomorrow afternoon."',
    },
  },
  {
    id: "scenario-3",
    title: "Real-Time WebSocket Architecture",
    meetUrl: "meet.google.com/rt-ws-pipeline",
    duration: "08:45",
    activeRoster: [
      { name: "Alex Rivera", role: "Backend Architect", avatar: "AR", color: "bg-indigo-600 text-white" },
      { name: "Sarah Jenkins", role: "SecOps Lead", avatar: "SJ", color: "bg-blue-600 text-white" },
    ],
    speechTurn: {
      timestamp: "03:41.0",
      speaker: "Alex Rivera",
      speakerColor: "text-indigo-400",
      text: "Let's hook up the green pulse connection monitor in the sidebar to broadcast WebSocket reconnection events.",
    },
    proposal: {
      title: "Connect Sidebar Heartbeat Indicator to Real-Time Socket Events",
      priority: "MEDIUM",
      suggestedAssignee: "Sarah Jenkins",
      confidence: 98,
      dueDate: "In 2 days",
      sourceQuote: '"Let\'s hook up the green pulse connection monitor in the sidebar to broadcast WebSocket reconnection events."',
    },
  },
];

export function LiveEngineSimulator() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>("scenario-1");
  const [approvedScenarioIds, setApprovedScenarioIds] = useState<Record<string, boolean>>({});

  const currentScenario = DEMO_SCENARIOS.find((s) => s.id === activeScenarioId) || DEMO_SCENARIOS[0];
  const isCurrentApproved = !!approvedScenarioIds[currentScenario.id];

  const handleApproveProposal = (id: string) => {
    setApprovedScenarioIds((prev) => ({ ...prev, [id]: true }));
  };

  const handleResetProposal = (id: string) => {
    setApprovedScenarioIds((prev) => ({ ...prev, [id]: false }));
  };

  return (
    <div id="transformation-engine" className="scroll-mt-24">
      <div className="bg-[#1f2937] border border-[#374151] rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        {/* Engine Header / Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#374151]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-950/60 border border-blue-500/30 text-blue-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-sans text-lg font-bold text-white flex items-center gap-2">
                Live Meeting → Attributed Task Engine
              </h3>
              <p className="text-xs font-mono text-slate-400">
                Real-time telemetry stream simulation
              </p>
            </div>
          </div>

          {/* Scenario Switcher Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#111827] p-1 rounded-xl border border-[#374151]">
            {DEMO_SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveScenarioId(s.id)}
                className={`px-3 py-1.5 rounded-lg font-sans text-xs font-medium transition-all ${
                  activeScenarioId === s.id
                    ? "bg-blue-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>

        {/* Engine Grid */}
        <div className="grid lg:grid-cols-12 gap-6 pt-6">
          {/* Left Column: Live Audio Stream & Meet Roster (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Audio Waveform Stream */}
            <div className="bg-[#111827] border border-[#374151] rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-3">
                <span className="flex items-center gap-2 text-blue-400 font-semibold">
                  <Radio className="w-3.5 h-3.5 animate-pulse" /> Playwright Audio Bot
                </span>
                <span className="text-slate-400">{currentScenario.duration}</span>
              </div>

              {/* Waveform Visualization Bars */}
              <div className="h-10 flex items-center gap-1 px-2 bg-slate-900/90 rounded-lg border border-slate-700/60 overflow-hidden">
                {[40, 65, 30, 85, 95, 50, 70, 90, 45, 60, 100, 80, 55, 35, 75, 90, 40, 60, 85, 50, 70, 30, 95, 80, 45, 60].map(
                  (h, idx) => (
                    <div
                      key={idx}
                      className="flex-1 bg-gradient-to-t from-blue-600 to-blue-400 rounded-full transition-all duration-300"
                      style={{ height: `${h}%` }}
                    />
                  )
                )}
              </div>
              <div className="mt-2 flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Target: {currentScenario.meetUrl}</span>
                <span className="text-emerald-400">Deepgram Nova-3 Active</span>
              </div>
            </div>

            {/* Live Presence Timeline */}
            <div className="bg-[#111827] border border-[#374151] rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-3">
                <span className="flex items-center gap-1.5 text-slate-200">
                  <Users className="w-3.5 h-3.5 text-indigo-400" /> Roster Presence Timeline
                </span>
                <span className="text-emerald-400 text-[10px]">Synced</span>
              </div>

              <div className="space-y-2">
                {currentScenario.activeRoster.map((person) => (
                  <div
                    key={person.name}
                    className="flex items-center justify-between bg-slate-800/60 border border-slate-700/80 p-2 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-6 h-6 rounded-full ${person.color} font-mono font-bold text-[10px] flex items-center justify-center`}
                      >
                        {person.avatar}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-100">{person.name}</div>
                        <div className="text-[10px] text-slate-400">{person.role}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 font-mono text-[10px] border border-emerald-800/40">
                      Active Speaker
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Diarized Speech Turn Box */}
            <div className="bg-[#111827] border border-[#374151] rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                <span className="flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-blue-400" /> Diarized Speech Turn
                </span>
                <span className="font-mono text-blue-400">{currentScenario.speechTurn.timestamp}</span>
              </div>
              <p className="text-xs text-slate-200 font-mono bg-slate-900 p-3 rounded-lg border border-slate-800 leading-relaxed">
                <span className={`font-bold ${currentScenario.speechTurn.speakerColor}`}>
                  [{currentScenario.speechTurn.speaker}]:
                </span>{" "}
                {currentScenario.speechTurn.text}
              </p>
            </div>
          </div>

          {/* Right Column: Weighted Attribution & Proposal -> Approved Kanban Card (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between bg-[#111827] border border-[#374151] rounded-xl p-5 relative">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                    Weighted Speaker Attribution Engine
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded bg-indigo-950/70 border border-indigo-500/40 text-indigo-300 font-mono text-xs font-bold">
                  {currentScenario.proposal.confidence}% CONFIDENCE MATCH
                </span>
              </div>

              {!isCurrentApproved ? (
                <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-5 space-y-4 shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-semibold uppercase tracking-wider">
                        AI Task Proposal (Pending Approval)
                      </span>
                      <h4 className="font-sans text-base font-bold text-white pt-1">
                        {currentScenario.proposal.title}
                      </h4>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-rose-950/70 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold">
                      {currentScenario.proposal.priority}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 italic">
                    Source quote: {currentScenario.proposal.sourceQuote}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Suggested Assignee</span>
                      <span className="text-blue-400 font-semibold flex items-center gap-1 pt-0.5">
                        <UserCheck className="w-3.5 h-3.5" /> @{currentScenario.proposal.suggestedAssignee}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Estimated Target</span>
                      <span className="text-slate-200 font-semibold flex items-center gap-1 pt-0.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> {currentScenario.proposal.dueDate}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      onClick={() => handleApproveProposal(currentScenario.id)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-semibold text-xs py-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-400 outline-none"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Approve Proposal & Publish Card
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-xl p-5 space-y-4 shadow-md transition-all animate-fade-in">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="px-2.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit">
                        <CheckCircle2 className="w-3 h-3" /> Live Kanban Card (In Progress Column)
                      </span>
                      <h4 className="font-sans text-base font-bold text-white pt-1">
                        {currentScenario.proposal.title}
                      </h4>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold">
                      VERIFIED
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 flex items-center justify-between">
                    <span>Assigned to: <strong className="text-emerald-400">@{currentScenario.proposal.suggestedAssignee}</strong></span>
                    <span className="text-slate-400">Card ID: #KAN-8492</span>
                  </div>

                  <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-xs font-mono text-emerald-300 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" /> Broadcasted to all board viewers via WebSocket
                    </span>
                    <button
                      onClick={() => handleResetProposal(currentScenario.id)}
                      className="text-[10px] text-slate-400 underline hover:text-white"
                    >
                      Reset Demo
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>Engine Latency: &lt;450ms</span>
              <span>Speaker Diarization Engine: Deepgram Nova-3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
