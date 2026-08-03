import { useState } from "react";
import { UserCheck, CheckSquare, ShieldCheck } from "lucide-react";

export function RoleValueSection() {
  const [activeRoleTab, setActiveRoleTab] = useState<"member" | "manager" | "superadmin">("manager");

  return (
    <section id="roles" className="py-20 px-4 sm:px-8 border-t border-slate-800/80 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h2 className="font-sans text-3xl sm:text-4xl font-bold text-white tracking-tight">
          Role-Tailored Intelligence
        </h2>
        <p className="text-slate-400 mt-3 text-sm sm:text-base font-sans">
          KAIO adapts specifically to your role in the organization.
        </p>

        {/* Role Switcher Tabs */}
        <div className="flex justify-center mt-8">
          <div className="inline-flex p-1 rounded-xl bg-[#1f2937] border border-[#374151] gap-1 font-sans text-xs">
            {(["member", "manager", "superadmin"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setActiveRoleTab(r)}
                className={`px-5 py-2 rounded-lg font-semibold uppercase transition-all ${
                  activeRoleTab === r
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Role Content Card */}
      <div className="bg-[#1f2937] border border-[#374151] rounded-2xl p-6 sm:p-8 max-w-4xl mx-auto">
        {activeRoleTab === "member" && (
          <div className="space-y-4 animate-fade-in font-sans">
            <div className="flex items-center gap-3 text-blue-400 font-mono text-xs font-bold uppercase">
              <UserCheck className="w-5 h-5" /> Team Member View
            </div>
            <h3 className="font-sans text-xl font-bold text-white">
              Zero Meeting Overhead. Work Assigned Instantly.
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Members receive owner-attributed tasks with direct transcript source quotes. No manual note-taking required—just review your assigned card on the Kanban board and start executing.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 font-mono text-xs pt-2">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300">
                ✓ Direct transcript quote verification
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300">
                ✓ Real-time task assignment notifications
              </div>
            </div>
          </div>
        )}

        {activeRoleTab === "manager" && (
          <div className="space-y-4 animate-fade-in font-sans">
            <div className="flex items-center gap-3 text-emerald-400 font-mono text-xs font-bold uppercase">
              <CheckSquare className="w-5 h-5" /> Manager View
            </div>
            <h3 className="font-sans text-xl font-bold text-white">
              Full Control with the Proposal Approval Queue
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Prevent AI noise on your board. Managers review AI task proposals, edit priority or due dates, and approve or reject cards before they hit the live board. Monitor team completion % and review weekly timesheets.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 font-mono text-xs pt-2">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300">
                ✓ Proposal review & approval queue
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300">
                ✓ Timesheet locking & effort approval
              </div>
            </div>
          </div>
        )}

        {activeRoleTab === "superadmin" && (
          <div className="space-y-4 animate-fade-in font-sans">
            <div className="flex items-center gap-3 text-indigo-400 font-mono text-xs font-bold uppercase">
              <ShieldCheck className="w-5 h-5" /> Superadmin View
            </div>
            <h3 className="font-sans text-xl font-bold text-white">
              Governance, Multi-Device Sessions & Audit Logs
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Full enterprise administrative authority. Manage multi-device active sessions, review security audit events, configure organization-wide timesheet policies, and enforce RBAC rules.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 font-mono text-xs pt-2">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300">
                ✓ Remote session revocation across devices
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300">
                ✓ Complete security audit event log
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
