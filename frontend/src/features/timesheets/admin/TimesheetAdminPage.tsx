import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Settings,
  Sliders,
  Users,
  BarChart3,
  Clock,
  Eye,
  Download,
  Calendar,
  Filter,
  AlarmClock,
  TrendingUp,
  CalendarDays,
  AlertTriangle,
  Minus,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../../../store/authStore";
import { isSuperAdmin } from "../../../lib/rbac";
import TimesheetPolicyForm from "./TimesheetPolicyForm";
import ApproverAssignmentManager from "./ApproverAssignmentManager";
import {
  Card,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../../components/ui/Card";
import {
  exportTimesheetsCsv,
  getTimesheetPolicy,
  type TimesheetPolicy,
} from "../../../services/timesheetAdminService";
import { getUsers, type User } from "../../../services/usersApi";

type TabType = "all" | "policy" | "approvers" | "reports";
type DateMode = "week" | "preset" | "range";
type PresetPeriod = "1m" | "3m" | "6m" | "1y";

const getMondayOfCurrentWeek = (): string => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split("T")[0];
};

export const TimesheetAdminPage: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>("all");

  // Filter state
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [dateMode, setDateMode] = useState<DateMode>("week");
  const [exportDate, setExportDate] = useState<string>(
    getMondayOfCurrentWeek(),
  );
  const [selectedPreset, setSelectedPreset] = useState<PresetPeriod>("1m");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [overviewPolicy, setOverviewPolicy] = useState<TimesheetPolicy | null>(
    null,
  );

  useEffect(() => {
    getUsers()
      .then((data) => setEmployees(data || []))
      .catch((err) =>
        console.error("Failed to load users for timesheet export:", err),
      );
  }, []);

  useEffect(() => {
    if (activeTab === "all") {
      getTimesheetPolicy()
        .then(setOverviewPolicy)
        .catch(() => {});
    }
  }, [activeTab]);

  // Route guard: Only Superadmin can access Timesheet Policy
  if (!user || !isSuperAdmin(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  const superAdmin = isSuperAdmin(user);

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const options: any = {
        user_id: selectedEmployee,
      };

      if (dateMode === "week") {
        options.week_start_date = exportDate;
      } else if (dateMode === "preset") {
        options.period = selectedPreset;
      } else if (dateMode === "range") {
        if (fromDate) options.from_date = fromDate;
        if (toDate) options.to_date = toDate;
      }

      const blob = await exportTimesheetsCsv(options);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const empLabel =
        selectedEmployee === "all" ? "all" : `user_${selectedEmployee}`;
      const dateLabel =
        dateMode === "week"
          ? exportDate
          : dateMode === "preset"
            ? selectedPreset
            : `${fromDate}_to_${toDate}`;
      a.download = `timesheets_${empLabel}_${dateLabel}.csv`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Timesheet report exported successfully");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.detail || "Failed to export timesheet CSV",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto min-h-0 space-y-8 max-w-7xl mx-auto pb-16 px-6 pt-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-border/60 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
              <Settings size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-brand-text flex items-center gap-3">
                Timesheet Configuration
                {!superAdmin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Eye size={12} /> Read-Only
                  </span>
                )}
              </h1>
              <p className="text-sm text-brand-text-muted mt-0.5">
                Manage organization-wide timesheet policy rules and project
                approval chains.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center bg-brand-surface-low border border-brand-border/60 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "all"
                ? "bg-brand-primary text-white shadow-xs"
                : "text-brand-text-muted hover:text-brand-text"
            }`}
          >
            <Sliders size={14} />
            Overview
          </button>
          <button
            onClick={() => setActiveTab("policy")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "policy"
                ? "bg-brand-primary text-white shadow-xs"
                : "text-brand-text-muted hover:text-brand-text"
            }`}
          >
            <Clock size={14} />
            Policy
          </button>
          <button
            onClick={() => setActiveTab("approvers")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "approvers"
                ? "bg-brand-primary text-white shadow-xs"
                : "text-brand-text-muted hover:text-brand-text"
            }`}
          >
            <Users size={14} />
            Approvers
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "reports"
                ? "bg-brand-primary text-white shadow-xs"
                : "text-brand-text-muted hover:text-brand-text"
            }`}
          >
            <BarChart3 size={14} />
            Reports
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "reports" ? (
        <div className="max-w-3xl mx-auto space-y-6">
          <Card
            variant="glass"
            className="p-6 shadow-lg border-brand-border/60"
          >
            <CardContent className="space-y-6">
              <div className="flex items-center gap-3 border-b border-brand-border/60 pb-4">
                <div className="p-3 rounded-2xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                  <BarChart3 size={24} />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-brand-text">
                    Timesheet Report Exporter
                  </CardTitle>
                  <CardDescription className="text-sm text-brand-text-muted">
                    Filter by employee and date range or preset period, then
                    export complete timesheets as a formatted CSV file.
                  </CardDescription>
                </div>
              </div>

              <div className="space-y-5">
                {/* 1. Employee Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-brand-text flex items-center gap-1.5">
                    <Filter size={13} className="text-brand-primary" /> Employee
                    Filter
                  </label>
                  <select
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-sm font-medium focus:ring-2 focus:ring-brand-primary focus:outline-none"
                  >
                    <option value="all">
                      All Employees (Organization Wide)
                    </option>
                    {employees.map((u) => {
                      const name = u.first_name
                        ? `${u.first_name} ${u.last_name || ""}`.trim()
                        : u.email;
                      return (
                        <option key={u.id} value={String(u.id)}>
                          {name} ({u.email})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 2. Date Filter Mode Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-brand-text flex items-center gap-1.5">
                    <Calendar size={13} className="text-brand-primary" /> Date
                    Filter Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2 p-1 bg-brand-surface-low border border-brand-border/60 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setDateMode("week")}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        dateMode === "week"
                          ? "bg-brand-primary text-white shadow-xs"
                          : "text-brand-text-muted hover:text-brand-text"
                      }`}
                    >
                      Single Week
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateMode("preset")}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        dateMode === "preset"
                          ? "bg-brand-primary text-white shadow-xs"
                          : "text-brand-text-muted hover:text-brand-text"
                      }`}
                    >
                      Preset Period
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateMode("range")}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        dateMode === "range"
                          ? "bg-brand-primary text-white shadow-xs"
                          : "text-brand-text-muted hover:text-brand-text"
                      }`}
                    >
                      Custom Date Range
                    </button>
                  </div>
                </div>

                {/* 3. Dynamic Inputs based on Date Mode */}
                {dateMode === "week" ? (
                  <div className="space-y-1.5 bg-brand-surface-low/50 p-4 rounded-xl border border-brand-border/60">
                    <label className="text-xs font-semibold text-brand-text block">
                      Week Start Date
                    </label>
                    <input
                      type="date"
                      value={exportDate}
                      onChange={(e) => setExportDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-brand-border bg-brand-bg text-brand-text text-sm font-medium focus:ring-2 focus:ring-brand-primary focus:outline-none"
                    />
                  </div>
                ) : dateMode === "preset" ? (
                  <div className="space-y-1.5 bg-brand-surface-low/50 p-4 rounded-xl border border-brand-border/60">
                    <label className="text-xs font-semibold text-brand-text block">
                      Select Timeframe Preset
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: "1m", label: "Last 1 Month" },
                        { id: "3m", label: "Last 3 Months" },
                        { id: "6m", label: "Last 6 Months" },
                        { id: "1y", label: "Last 1 Year" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            setSelectedPreset(item.id as PresetPeriod)
                          }
                          className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                            selectedPreset === item.id
                              ? "bg-brand-primary/10 border-brand-primary text-brand-primary font-bold"
                              : "bg-brand-bg border-brand-border text-brand-text-muted hover:text-brand-text"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-brand-surface-low/50 p-4 rounded-xl border border-brand-border/60">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-brand-text block">
                        From Date
                      </label>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-brand-border bg-brand-bg text-brand-text text-sm font-medium focus:ring-2 focus:ring-brand-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-brand-text block">
                        To Date
                      </label>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-brand-border bg-brand-bg text-brand-text text-sm font-medium focus:ring-2 focus:ring-brand-primary focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* 4. Export CTA Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleExportCsv}
                    disabled={isExporting}
                    className="w-full sm:w-auto px-6 py-2.5 text-xs font-semibold bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm h-[42px]"
                  >
                    <Download size={15} />
                    {isExporting
                      ? "Generating & Exporting CSV..."
                      : "Export Timesheet CSV"}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : activeTab === "policy" ? (
        <div className="max-w-3xl mx-auto">
          <TimesheetPolicyForm />
        </div>
      ) : activeTab === "approvers" ? (
        <div className="max-w-3xl mx-auto">
          <ApproverAssignmentManager />
        </div>
      ) : (
        /* Overview: policy summary stats strip + full-width approver manager */
        <div className="space-y-6">
          {/* Policy Stats Strip */}
          {overviewPolicy && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {
                  icon: <Clock size={16} className="text-brand-primary" />,
                  label: "Std Hours / Day",
                  value: `${overviewPolicy.standard_hours_per_day}h`,
                  sub: "per day",
                },
                {
                  icon: <AlarmClock size={16} className="text-violet-400" />,
                  label: "Std Hours / Week",
                  value: `${overviewPolicy.standard_hours_per_week}h`,
                  sub: "per week",
                },
                {
                  icon: <TrendingUp size={16} className="text-amber-400" />,
                  label: "Max Hours / Day",
                  value: `${overviewPolicy.max_hours_per_day}h`,
                  sub: "daily cap",
                },
                {
                  icon: <CalendarDays size={16} className="text-emerald-400" />,
                  label: "Week Starts",
                  value:
                    overviewPolicy.week_start_day.charAt(0).toUpperCase() +
                    overviewPolicy.week_start_day.slice(1),
                  sub: "week start day",
                },
                {
                  icon:
                    overviewPolicy.overtime_policy === "none" ? (
                      <Minus size={16} className="text-brand-text-muted" />
                    ) : overviewPolicy.overtime_policy === "flag_only" ? (
                      <AlertTriangle size={16} className="text-amber-400" />
                    ) : (
                      <AlertTriangle size={16} className="text-red-400" />
                    ),
                  label: "Overtime",
                  value:
                    overviewPolicy.overtime_policy === "none"
                      ? "Not tracked"
                      : overviewPolicy.overtime_policy === "flag_only"
                        ? "Flagged"
                        : "Blocked",
                  sub: "overtime policy",
                },
                {
                  icon: <ArrowRight size={16} className="text-sky-400" />,
                  label: "Submit Deadline",
                  value: `${overviewPolicy.submission_deadline_days}d`,
                  sub: "after week ends",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col gap-2 p-4 rounded-xl border border-brand-border/60 bg-brand-surface-low hover:border-brand-border transition-colors"
                >
                  <div className="flex items-center justify-between">
                    {stat.icon}
                  </div>
                  <div>
                    <div className="text-xl font-bold text-brand-text tracking-tight">
                      {stat.value}
                    </div>
                    <div className="text-[10px] text-brand-text-muted font-medium uppercase tracking-wide mt-0.5">
                      {stat.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick-edit policy link banner */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-brand-primary/5 border border-brand-primary/15">
            <div className="flex items-center gap-2 text-sm text-brand-text-muted">
              <Settings size={14} className="text-brand-primary" />
              <span>Need to adjust policy values?</span>
            </div>
            <button
              onClick={() => setActiveTab("policy")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:underline"
            >
              Edit Policy <ArrowRight size={12} />
            </button>
          </div>

          {/* Full-width Approver Manager */}
          <ApproverAssignmentManager />
        </div>
      )}
    </div>
  );
};

export default TimesheetAdminPage;
