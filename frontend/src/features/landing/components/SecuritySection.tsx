import { Lock, Key, Shield, FileText, Layers } from "lucide-react";

export function SecuritySection() {
  return (
    <section id="security" className="py-20 px-4 sm:px-8 border-t border-slate-800/80 bg-[#0b0f19]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-indigo-400 mb-4">
            <Lock className="w-3.5 h-3.5" />
            <span>SECURITY FIRST ARCHITECTURE</span>
          </div>
          <h2 className="font-sans text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Enterprise Trust & Compliance
          </h2>
          <p className="text-slate-400 mt-3 text-sm sm:text-base font-sans">
            Built from the ground up for strict data isolation and secure access.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-[#1f2937] border border-[#374151] p-6 rounded-2xl space-y-3">
            <Key className="w-6 h-6 text-blue-400" />
            <h3 className="font-sans text-base font-bold text-white">httpOnly Cookie JWT</h3>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Tokens are stored exclusively in httpOnly, SameSite cookies to protect against XSS attack vectors.
            </p>
          </div>

          <div className="bg-[#1f2937] border border-[#374151] p-6 rounded-2xl space-y-3">
            <Shield className="w-6 h-6 text-emerald-400" />
            <h3 className="font-sans text-base font-bold text-white">Session Management</h3>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Track active device sessions per user with one-click remote session revocation capability.
            </p>
          </div>

          <div className="bg-[#1f2937] border border-[#374151] p-6 rounded-2xl space-y-3">
            <FileText className="w-6 h-6 text-indigo-400" />
            <h3 className="font-sans text-base font-bold text-white">Security Audit Log</h3>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Immutable event stream for logins, role mutations, data exports, and administrative actions.
            </p>
          </div>

          <div className="bg-[#1f2937] border border-[#374151] p-6 rounded-2xl space-y-3">
            <Layers className="w-6 h-6 text-purple-400" />
            <h3 className="font-sans text-base font-bold text-white">Strict 3-Tier RBAC</h3>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Enforced at backend router endpoints and UI navigation (Member, Manager, Superadmin).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
