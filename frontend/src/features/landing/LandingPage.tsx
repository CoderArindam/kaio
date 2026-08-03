import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, Activity } from "lucide-react";
import { LandingHeader } from "./components/LandingHeader";
import { LiveEngineSimulator } from "./components/LiveEngineSimulator";
import { PipelineSection } from "./components/PipelineSection";
import { CapabilitiesSection } from "./components/CapabilitiesSection";
import { RoleValueSection } from "./components/RoleValueSection";
import { SecuritySection } from "./components/SecuritySection";
import { CtaSection } from "./components/CtaSection";
import { LandingFooter } from "./components/LandingFooter";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* Telemetry Header Navigation */}
      <LandingHeader />

      {/* Hero Section with Live Demo Engine */}
      <section className="relative pt-12 pb-20 px-4 sm:px-8 max-w-7xl mx-auto overflow-hidden">
        {/* Background glow radial backdrop */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-emerald-600/10 blur-[100px] pointer-events-none rounded-full" />

        <div className="text-center max-w-4xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono text-blue-400 mb-6 shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>FUSING PRESENCE TIMELINES + DIARIZED SPEECH TURNS</span>
          </div>

          <h1 className="font-sans text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.15] mb-6">
            Don't just record meetings. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-teal-300 to-emerald-400">
              Orchestrate the work.
            </span>
          </h1>

          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed mb-8 font-sans">
            KAIO fuses live Google Meet roster events with Deepgram Nova-3 diarization. It knows who was in the room, who said what, and generates verified Kanban cards straight into your manager approval queue.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => navigate("/signup")}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-6 py-3.5 rounded-xl shadow-md transition-all flex items-center gap-2 font-sans focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
            >
              Start Free Workspace <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#transformation-engine"
              className="bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-sans text-xs font-medium px-6 py-3.5 rounded-xl transition-all flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
            >
              <Activity className="w-4 h-4 text-blue-400" /> Explore Interactive Engine
            </a>
          </div>
        </div>

        {/* Signature Interactive Engine Simulator Component */}
        <LiveEngineSimulator />
      </section>

      {/* 6-Stage Engine Pipeline */}
      <PipelineSection />

      {/* Capabilities Matrix */}
      <CapabilitiesSection />

      {/* Role-Based Value Switcher */}
      <RoleValueSection />

      {/* Enterprise Security Architecture */}
      <SecuritySection />

      {/* Final Call to Action */}
      <CtaSection />

      {/* Landing Footer */}
      <LandingFooter />
    </div>
  );
}
