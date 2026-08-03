import { useNavigate } from "react-router-dom";
import { ArrowRight, LayoutGrid } from "lucide-react";

export function LandingHeader() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-[#0b0f19]/90 border-b border-slate-800/80 px-4 sm:px-8 py-4 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <LayoutGrid className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="font-sans font-bold text-xl tracking-tight text-white">
              KAIO
            </span>
          </div>

          {/* Live Socket Status Pulse */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-[11px] font-mono text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>WS CONNECTED</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="hidden lg:flex items-center gap-8 text-xs font-medium text-slate-300">
          <a href="#pipeline" className="hover:text-white transition-colors">
            Engine Pipeline
          </a>
          <a href="#capabilities" className="hover:text-white transition-colors">
            Capabilities
          </a>
          <a href="#roles" className="hover:text-white transition-colors">
            Role Matrix
          </a>
          <a href="#security" className="hover:text-white transition-colors">
            Security
          </a>
        </nav>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/login")}
            className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          >
            Sign In
          </button>
          <button
            onClick={() => navigate("/signup")}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition-all flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          >
            Start Workspace <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
