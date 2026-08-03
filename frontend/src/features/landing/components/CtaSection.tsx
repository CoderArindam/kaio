import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  const navigate = useNavigate();

  return (
    <section className="py-20 px-4 sm:px-8 border-t border-slate-800 max-w-7xl mx-auto">
      <div className="bg-gradient-to-br from-[#1f2937] via-[#111827] to-[#0b0f19] border border-[#374151] rounded-3xl p-8 sm:p-14 text-center relative overflow-hidden shadow-xl">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <h2 className="font-sans text-3xl sm:text-5xl font-bold text-white tracking-tight max-w-2xl mx-auto leading-tight mb-4">
          Ready to stop recording and start orchestrating?
        </h2>
        <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto mb-8 font-sans">
          Start orchestrating meetings with Deepgram Nova-3 diarization, presence tracking, and manager approval queues today.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => navigate("/signup")}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-8 py-4 rounded-xl shadow-md transition-all font-sans flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          >
            Start Workspace Free <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate("/login")}
            className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 font-sans text-xs font-semibold px-6 py-4 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          >
            Sign In to Workspace
          </button>
        </div>
      </div>
    </section>
  );
}
