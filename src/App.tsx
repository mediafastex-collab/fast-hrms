import {
  Banknote,
  Bell,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Menu,
  Settings,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  UserRound,
  UsersRound,
  Coffee,
  X,
  Image as ImageIcon,
  ClipboardList,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Repeat,
  Pause,
  Play,
} from "lucide-react";
import { Fragment, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Role = "Superadmin" | "Employee";
type View =
  | "dashboard"
  | "employees"
  | "attendance"
  | "tasks"
  | "leave"
  | "payroll"
  | "reports"
  | "settings"
  | "profile";

type User = {
  id: number;
  email: string;
  role: Role;
  employeeId?: number;
  employeeName?: string;
  displayName?: string;
};

type Employee = {
  id: number;
  user_id?: number;
  employee_code: string;
  full_name: string;
  email: string;
  phone?: string;
  department_id?: number;
  department_name?: string;
  designation_id?: number;
  designation_name?: string;
  joining_date: string;
  monthly_salary: number;
  employment_status: "Active" | "Inactive";
  address?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
};

type Department = { id: number; name: string; shift_min_hours?: number | null; half_day_min_hours?: number | null; late_mark_time?: string | null };
type Designation = { id: number; name: string };
type LeaveType = { id: number; name: string; is_paid: number; monthly_balance: number; yearly_balance: number };
type Holiday = { id: number; name: string; holiday_date: string; description?: string };
type AuditLog = { id: number; action: string; entity_type: string; entity_id?: number; details?: string; actor_email?: string; created_at: string };
type CompanySettings = {
  company_name: string;
  company_logo_url?: string;
  company_address?: string;
  working_days: string;
  office_start_time: string;
  office_end_time: string;
  late_mark_time: string;
  half_day_min_hours: number;
  shift_min_hours: number;
  deduct_absent_days: number;
};

type AttendanceRecord = {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  department_name?: string;
  attendance_date: string;
  check_in?: string;
  check_out?: string;
  missed_checkout?: number;
  break_start?: string;
  break_end?: string;
  breaks?: AttendanceBreak[];
  total_hours: number;
  status: "Present" | "Absent" | "Half Day" | "Late" | "On Leave";
  notes?: string;
  early_checkout_reason?: string;
  late_checkin_reason?: string;
};

type AttendanceBreak = {
  id: number;
  break_start: string;
  break_end?: string | null;
  reason?: string | null;
};

type LeaveRequest = {
  id: number;
  employee_id: number;
  employee_name?: string;
  leave_type_id: number;
  leave_type_name?: string;
  is_paid?: number;
  start_date: string;
  end_date: string;
  days: number;
  reason?: string;
  status: "Pending" | "Approved" | "Rejected";
  admin_note?: string;
  created_at?: string;
};

type Salary = {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  salary_month: number;
  salary_year: number;
  working_days: number;
  paid_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  gross_salary: number;
  deductions: number;
  net_salary: number;
  status: "Pending" | "Done";
  payment_proof?: string;
};

type DashboardSummary = {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  pendingLeaveRequests: number;
  approvedLeavesThisMonth: number;
  pendingSalaries: number;
  salaryDoneCount: number;
  estimatedMonthlyPayroll: number;
  lastMonthPayable?: number;
  lastMonthOutstanding?: number;
  lastMonthPaid?: number;
  lastMonthLabel?: string;
  taskTotal?: number;
  taskDone?: number;
  taskOngoing?: number;
  taskPending?: number;
  onLeaveToday?: number;
  pendingCorrections?: number;
  missedCheckouts?: number;
};

type EmployeeSummary = {
  todayAttendance?: AttendanceRecord;
  monthAttendance: { present: number; late: number; halfDay: number; absent: number; leave?: number };
  leaveBalance: number;
  recentLeaves: LeaveRequest[];
  currentSalary?: Salary;
  latestSalary?: Salary;
  upcomingLeaves?: LeaveRequest[];
  upcomingHolidays?: Holiday[];
  missedDays?: string[];
};

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const today = new Date().toISOString().slice(0, 10);
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Seconds since midnight for an HH:MM or HH:MM:SS string.
function timeToSeconds(value?: string): number | null {
  if (!value) return null;
  const [h = 0, m = 0, s = 0] = value.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

// Total seconds of finished breaks for a day (multi-break aware, legacy fallback).
function closedBreakSeconds(row: AttendanceRecord): number {
  if (row.breaks && row.breaks.length) {
    return row.breaks.reduce((sum, b) => {
      const s = timeToSeconds(b.break_start);
      const e = timeToSeconds(b.break_end ?? undefined);
      return s != null && e != null ? sum + Math.max(0, e - s) : sum;
    }, 0);
  }
  const bs = timeToSeconds(row.break_start);
  const be = timeToSeconds(row.break_end);
  return bs != null && be != null ? Math.max(0, be - bs) : 0;
}

// The break that hasn't ended yet, if any.
function openBreakOf(row?: AttendanceRecord): AttendanceBreak | undefined {
  if (!row) return undefined;
  if (row.breaks && row.breaks.length) return row.breaks.find((b) => !b.break_end);
  return row.break_start && !row.break_end ? { id: 0, break_start: row.break_start } : undefined;
}

// Actual worked duration as "Hh Mm Ss" = (check-out − check-in) − all breaks. Falls back to stored hours.
function workedHMS(row: AttendanceRecord): string {
  const ci = timeToSeconds(row.check_in);
  const co = timeToSeconds(row.check_out);
  if (ci == null || co == null) {
    return row.total_hours !== undefined ? `${Number(row.total_hours).toFixed(1)} hrs` : "-";
  }
  const sec = Math.max(0, co - ci - closedBreakSeconds(row));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(payload.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function statusTone(status: string) {
  if (["Done", "Approved", "Present"].includes(status)) return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15";
  if (["Pending", "Late", "Half Day"].includes(status)) return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15";
  if (["Rejected", "Absent", "Inactive"].includes(status)) return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/15";
  return "bg-[var(--surface-sunk)] text-ink-2 ring-1 ring-inset ring-[var(--line-strong)]";
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="card card-hover p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
          <p className="tnum mt-1.5 text-[26px] font-bold leading-none tracking-[-0.03em] text-ink">{value}</p>
          {sub ? <p className="mt-2 text-[11.5px] text-ink-3">{sub}</p> : null}
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunk)] text-ink-3">
          <Icon size={16} strokeWidth={1.9} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-white px-8 py-12 text-center" style={{ borderColor: "var(--line-strong)" }}>
      <p className="text-sm font-semibold text-ink-2">{title}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ user: User }>("/me")
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    setError("");
    try {
      const payload = await api<{ user: User }>("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(payload.user);
      setView("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function logout() {
    await api("/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setView("dashboard");
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-cloud text-sm font-semibold">Loading Fast HRMS...</div>;
  }

  if (!user) {
    return <LoginScreen error={error} onLogin={login} />;
  }

  return <Shell user={user} view={view} onView={setView} onLogout={logout} />;
}

function LoginScreen({ error, onLogin }: { error: string; onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onLogin(email, password);
    setBusy(false);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10" style={{ background: "var(--canvas)" }}>
      {/* A single soft wash of brand colour behind the card — enough to feel
          considered, far short of the three-colour gradient it replaces. */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-18rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 65%)" }} />

      <div className="animate-rise relative w-full max-w-[22rem]">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white" style={{ boxShadow: "0 8px 24px rgba(234,88,12,0.28)" }}>
            <BriefcaseBusiness size={26} strokeWidth={2.1} />
          </div>
          <h1 className="mt-5 text-[32px] font-bold leading-none tracking-[-0.04em] text-ink">
            Fastex <span className="text-brand">HRMS</span>
          </h1>
          <p className="mt-2.5 text-[13.5px] text-ink-3">Sign in to your workspace</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
          {error ? (
            <div className="animate-pop rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/15">
              {error}
            </div>
          ) : null}
          <Field label="Email">
            <input required autoFocus className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@fastexmedia.com" />
          </Field>
          <Field label="Password">
            <input required className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
          </Field>
          <button className="btn btn-primary min-h-[42px] w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11.5px] text-ink-4">© {new Date().getFullYear()} Fastex Media</p>
      </div>
    </main>
  );
}

function Shell({ user, view, onView, onLogout }: { user: User; view: View; onView: (view: View) => void; onLogout: () => void }) {
  const isAdmin = user.role === "Superadmin";
  const [mobileOpen, setMobileOpen] = useState(false);
  // Collapsed rail vs. full-width nav, remembered between visits.
  const newVersion = useNewVersionAvailable();
  const [navOpen, setNavOpen] = useState(() => localStorage.getItem("fast_hrms_nav") !== "collapsed");
  useEffect(() => { localStorage.setItem("fast_hrms_nav", navOpen ? "open" : "collapsed"); }, [navOpen]);
  // One short list, in the order a day actually runs. Holidays, leave types,
  // departments and the audit log live inside the page they belong to.
  const navGroups: Array<{ group: string; items: Array<{ id: View; label: string; icon: typeof UsersRound; show: boolean }> }> = [
    { group: "", items: [
      { id: "dashboard" as View, label: "Home", icon: LayoutDashboard, show: true },
      { id: "employees" as View, label: "People", icon: UsersRound, show: isAdmin },
      { id: "attendance" as View, label: "Attendance", icon: CalendarCheck, show: true },
      { id: "leave" as View, label: "Leave", icon: FileText, show: true },
      { id: "payroll" as View, label: isAdmin ? "Payroll" : "Payslips", icon: Banknote, show: true },
      { id: "tasks" as View, label: "Tasks", icon: ClipboardList, show: true },
      { id: "reports" as View, label: "Reports", icon: Download, show: isAdmin },
      { id: "settings" as View, label: "Settings", icon: Settings, show: isAdmin },
      { id: "profile" as View, label: "My profile", icon: UserRound, show: !isAdmin },
    ] },
  ].map((g) => ({ ...g, items: g.items.filter((i) => i.show) })).filter((g) => g.items.length);

  const nav = navGroups.flatMap((g) => g.items);

  function choose(next: View) {
    onView(next);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen bg-cloud">
      <aside className={classNames(
        "fixed inset-y-0 left-0 z-20 hidden flex-col px-3 pb-3 pt-4 lg:flex",
        "transition-[width] duration-200 ease-premium",
        navOpen ? "w-[244px]" : "w-[72px]",
      )} style={{ background: "var(--rail)" }}>
        <div className={classNames("flex items-center gap-2.5 px-1.5 pb-5", !navOpen && "justify-center px-0")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-brand text-white">
            <BriefcaseBusiness size={17} strokeWidth={2.2} />
          </div>
          {navOpen ? (
            <p className="truncate text-[14.5px] font-semibold tracking-[-0.02em] text-white">Fastex HRMS</p>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.group || "top"} className={group.group ? "mt-4" : ""}>
              {group.group && navOpen ? (
                <p className="px-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[var(--rail-text)] opacity-70">
                  {group.group}
                </p>
              ) : null}
              {group.group && !navOpen ? (
                <div className="mx-auto mb-2 h-px w-5" style={{ background: "var(--rail-edge)" }} />
              ) : null}
              <div className="space-y-0.5">
          {group.items.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => choose(item.id)}
                title={navOpen ? undefined : item.label}
                className={classNames(
                  "group relative flex w-full items-center rounded-lg py-[7px] text-[13px] transition-colors duration-150 ease-premium",
                  navOpen ? "gap-3 px-2.5" : "justify-center px-0",
                  active ? "font-semibold text-white" : "font-medium text-[var(--rail-text)] hover:text-white",
                )}
                style={active ? { background: "var(--rail-active)" } : undefined}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--rail-hover)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {active ? <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-brand" /> : null}
                <item.icon size={16.5} strokeWidth={active ? 2.2 : 1.9} className="shrink-0" />
                {navOpen ? <span className="truncate">{item.label}</span> : null}
              </button>
            );
          })}
              </div>
            </div>
          ))}
        </nav>

        {/* Identity lives with the navigation, which lets the content area drop
            its header bar entirely — one less horizontal band across the page. */}
        <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--rail-edge)" }}>
          <div className={classNames("flex items-center gap-2.5 rounded-lg px-1.5 py-2", !navOpen && "justify-center px-0")}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
              {initialsOf(user.displayName ?? user.employeeName ?? user.email)}
            </span>
            {navOpen ? (
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[12.5px] font-semibold text-white">{user.displayName ?? user.employeeName ?? user.email}</span>
                <span className="block truncate text-[10.5px] text-[var(--rail-text)]">{user.role}</span>
              </span>
            ) : null}
            {navOpen ? (
              <button type="button" onClick={onLogout} title="Logout"
                className="shrink-0 rounded-md p-1.5 text-[var(--rail-text)] transition-colors duration-150 hover:bg-[var(--rail-hover)] hover:text-white">
                <LogOut size={15} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setNavOpen((open) => !open)}
            title={navOpen ? "Collapse menu" : "Expand menu"}
            className={classNames(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--rail-text)] transition-colors duration-150 hover:bg-[var(--rail-hover)] hover:text-white",
              !navOpen && "justify-center px-0",
            )}
          >
            <Menu size={15} className="shrink-0" />
            {navOpen ? "Collapse" : null}
          </button>
        </div>
      </aside>

      <div className={navOpen ? "lg:pl-[244px]" : "lg:pl-[72px]"}>
        {newVersion ? (
          <div className="flex flex-wrap items-center justify-center gap-3 bg-brand px-4 py-2 text-sm font-semibold text-white">
            A newer version of Fast HRMS is ready.
            <button type="button" className="rounded-full bg-white/20 px-3 py-1 hover:bg-white/30" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        ) : null}
        {/* No header band on desktop any more: identity sits in the rail, so the
            only thing that needs floating here is the bell. The page title below
            becomes the top of the page, the way a document starts with its title. */}
        <header className="sticky top-0 z-10 bg-[var(--canvas)]/80 backdrop-blur-xl">
          <div className={classNames("mx-auto flex items-center gap-2 px-5 pb-1 pt-3", "max-w-7xl")}>
            <button className="btn btn-soft px-2.5 lg:hidden" onClick={() => setMobileOpen((open) => !open)} title="Menu">
              <Menu size={17} />
            </button>
            <span className="truncate text-[13px] font-semibold text-ink lg:hidden">
              {user.displayName ?? user.employeeName ?? user.email}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <NotificationBell />
              <button className="btn btn-ghost px-2.5 lg:hidden" onClick={onLogout} title="Logout">
                <LogOut size={16} />
              </button>
            </div>
          </div>
          <nav className={classNames("grid gap-2 px-4 pb-3 sm:grid-cols-2 lg:hidden", mobileOpen ? "grid" : "hidden")}>
            {nav.map((item) => (
              <button
                key={item.id}
                onClick={() => choose(item.id)}
                className={classNames("btn justify-start", view === item.id ? "btn-primary" : "btn-soft")}
              >
                <item.icon size={17} />
                {item.label}
              </button>
            ))}
          </nav>
        </header>

        <main key={view} className={classNames("view-enter mx-auto px-5 pb-10 pt-3", "max-w-7xl")}>
          {view === "dashboard" ? user.role === "Superadmin" ? <AdminDashboard onView={choose} /> : <EmployeeDashboard onView={choose} /> : null}
          {view === "employees" && isAdmin ? <Employees /> : null}
          {view === "attendance" ? <Attendance isAdmin={isAdmin} /> : null}
          {view === "tasks" ? <Tasks isAdmin={isAdmin} /> : null}
          {view === "leave" ? <Leave isAdmin={isAdmin} /> : null}
          {view === "payroll" ? <Payroll isAdmin={isAdmin} /> : null}
          {view === "reports" && isAdmin ? <Reports /> : null}
          {view === "settings" && isAdmin ? <SettingsPage /> : null}
          {view === "profile" && !isAdmin ? <Profile /> : null}
        </main>
      </div>

    </div>
  );
}

// A row on Home that says what needs doing and takes you there in one click.
function ActionRow({ count, label, onClick, tone = "warn" }: { count: number; label: string; onClick: () => void; tone?: "warn" | "bad" }) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[var(--surface-sunk)]">
      <span className={classNames("tnum flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] font-bold",
        tone === "bad" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}>{count}</span>
      <span className="flex-1 text-[13.5px] font-medium text-ink">{label}</span>
      <ChevronRight size={15} className="text-ink-4" />
    </button>
  );
}

function AdminDashboard({ onView }: { onView: (view: View) => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ summary: DashboardSummary }>("/admin/summary")
      .then((data) => setSummary(data.summary))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <EmptyState title={error} />;
  if (!summary) return <EmptyState title="Loading…" />;

  const notIn = Math.max(0, summary.absentToday - (summary.onLeaveToday ?? 0));
  const todo = [
    { count: summary.pendingLeaveRequests, label: `Leave request${summary.pendingLeaveRequests === 1 ? "" : "s"} to approve`, view: "leave" as View, tone: "warn" as const },
    { count: summary.pendingCorrections ?? 0, label: `Attendance correction${summary.pendingCorrections === 1 ? "" : "s"} to review`, view: "attendance" as View, tone: "warn" as const },
    { count: summary.missedCheckouts ?? 0, label: "Missed check-outs this week, counted as leave", view: "attendance" as View, tone: "bad" as const },
  ].filter((t) => t.count > 0);

  return (
    <section className="space-y-5">
      <PageTitle title="Home" description={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* Today, in three numbers. */}
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">Today</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ["In", summary.presentToday, "text-emerald-600"],
              ["Not in yet", notIn, "text-ink"],
              ["On leave", summary.onLeaveToday ?? 0, "text-ink-3"],
            ].map(([label, value, tone]) => (
              <div key={label as string}>
                <p className={classNames("tnum text-[30px] font-bold leading-none tracking-[-0.03em]", tone as string)}>{value}</p>
                <p className="mt-1.5 text-[12.5px] text-ink-3">{label}</p>
              </div>
            ))}
          </div>
          <button type="button" className="mt-4 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => onView("attendance")}>
            Open attendance →
          </button>
        </div>

        {/* Money still to go out. */}
        <div className="card p-5" style={{ background: "var(--brand-tint)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Salary to pay · {summary.lastMonthLabel ?? "last month"}</p>
          <p className="tnum mt-2 text-[30px] font-bold leading-none tracking-[-0.03em] text-ink">{currency.format(summary.lastMonthOutstanding ?? 0)}</p>
          <p className="mt-1.5 text-[12.5px] text-ink-3">
            {summary.lastMonthPaid ? `${currency.format(summary.lastMonthPaid)} of ${currency.format(summary.lastMonthPayable ?? 0)} already paid` : "Nothing paid yet for this month"}
          </p>
          <button type="button" className="mt-4 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => onView("payroll")}>
            Open payroll →
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="card p-2">
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-ink-4">Needs you</p>
          {todo.length ? todo.map((t) => (
            <ActionRow key={t.label} count={t.count} label={t.label} tone={t.tone} onClick={() => onView(t.view)} />
          )) : <p className="px-3 pb-4 pt-2 text-[13.5px] text-ink-3">Nothing waiting. All caught up.</p>}
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">Tasks</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ["To do", summary.taskPending ?? 0],
              ["In progress", summary.taskOngoing ?? 0],
              ["Done", summary.taskDone ?? 0],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="tnum text-[22px] font-bold leading-none text-ink">{value}</p>
                <p className="mt-1.5 text-[12.5px] text-ink-3">{label}</p>
              </div>
            ))}
          </div>
          <button type="button" className="mt-4 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => onView("tasks")}>
            Open tasks →
          </button>
        </div>
      </div>
    </section>
  );
}

function EmployeeDashboard({ onView }: { onView: (view: View) => void }) {
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [message, setMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  // Asked only when checking in late or leaving early.
  const [prompt, setPrompt] = useState<"check-in" | "check-out" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [data, settingsData] = await Promise.all([
      api<{ summary: EmployeeSummary }>("/employee/summary"),
      api<{ settings: CompanySettings }>("/settings"),
    ]);
    setSummary(data.summary);
    setSettings(settingsData.settings);
  }

  useEffect(() => { load().catch((err) => setMessage(err.message)); }, []);

  useEffect(() => {
    const att = summary?.todayAttendance;
    if (!att?.check_in || att.check_out) return;
    const tick = () => {
      const now = new Date();
      const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      let seconds = nowSec - (timeToSeconds(att.check_in) ?? 0) - closedBreakSeconds(att);
      const open = openBreakOf(att);
      if (open) seconds -= Math.max(0, nowSec - (timeToSeconds(open.break_start) ?? nowSec));
      setElapsed(Math.max(0, seconds));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [summary]);

  async function punch(action: "check-in" | "check-out" | "break-start" | "break-end", why?: string) {
    setMessage(""); setBusy(true);
    try {
      const body = why ? (action === "check-in" ? { late_checkin_reason: why } : { early_checkout_reason: why }) : null;
      await api(`/attendance/${action}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      setPrompt(null); setReason("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update attendance");
    }
    setBusy(false);
  }

  function checkIn() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (settings && hhmm > settings.late_mark_time) setPrompt("check-in");
    else punch("check-in");
  }

  function checkOut() {
    if (settings && elapsed / 3600 < settings.shift_min_hours) setPrompt("check-out");
    else punch("check-out");
  }

  if (!summary) return <EmptyState title={message || "Loading…"} />;
  const att = summary.todayAttendance;
  const isSunday = new Date().getDay() === 0;
  const checkedIn = Boolean(att?.check_in);
  const checkedOut = Boolean(att?.check_out);
  const onBreak = Boolean(openBreakOf(att));
  const hms = [Math.floor(elapsed / 3600), Math.floor((elapsed % 3600) / 60), elapsed % 60].map((n) => String(n).padStart(2, "0")).join(":");

  // Leave and holidays together, soonest first.
  const coming = [
    ...(summary.upcomingLeaves ?? []).map((l) => ({ key: `l${l.id}`, date: l.start_date, title: l.leave_type_name ?? "Leave", sub: l.start_date === l.end_date ? l.start_date : `${l.start_date} → ${l.end_date}` })),
    ...(summary.upcomingHolidays ?? []).map((h) => ({ key: `h${h.id}`, date: h.holiday_date, title: h.name, sub: `${h.holiday_date} · Holiday` })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  return (
    <section className="space-y-5">
      <PageTitle title="Home" description={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} />
      {message ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{message}</div> : null}

      {summary.missedDays?.length ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13.5px] text-rose-700">
          <span className="font-semibold">You didn't check out on {summary.missedDays.map(prettyDate).join(", ")}.</span>{" "}
          {summary.missedDays.length === 1 ? "That day is" : "Those days are"} counted as leave. If you were working, raise a correction from Attendance.
        </div>
      ) : null}

      {/* The one thing an employee comes here to do. */}
      <div className="card p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">Today</p>
            <p className="mt-2 text-[26px] font-bold leading-none tracking-[-0.03em] text-ink">
              {isSunday ? "Weekly off" : !checkedIn ? "Not checked in" : checkedOut ? "Day done" : onBreak ? "On a break" : "Working"}
            </p>
            <p className="tnum mt-2 text-[13px] text-ink-3">
              {checkedIn ? `In ${att?.check_in?.slice(0, 5)}${checkedOut ? ` · Out ${att?.check_out?.slice(0, 5)}` : ""}` : `Check in by ${settings?.late_mark_time ?? "—"} to be on time`}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            {checkedIn && !checkedOut ? <p className="tnum font-mono text-[28px] font-bold text-brand">{hms}</p> : null}
            <div className="flex gap-2">
              {isSunday || checkedOut ? null : !checkedIn ? (
                <button className="btn btn-primary min-h-[44px] px-8" disabled={busy} onClick={checkIn}><Clock3 size={18} />Check in</button>
              ) : (
                <>
                  {onBreak
                    ? <button className="btn btn-primary min-h-[44px]" disabled={busy} onClick={() => punch("break-end")}><CheckCircle2 size={18} />End break</button>
                    : <button className="btn btn-soft min-h-[44px]" disabled={busy} onClick={() => punch("break-start")}><Coffee size={18} />Break</button>}
                  <button className="btn btn-soft min-h-[44px] text-rose-600" disabled={busy} onClick={checkOut}>
                    <LogOut size={18} />Check out
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {checkedIn && !checkedOut ? (
          <p className="mt-4 border-t border-line pt-3 text-[12px] text-ink-4">
            Remember to check out before you leave — a day without a check-out is counted as leave.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">This month</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ["Present", summary.monthAttendance.present + summary.monthAttendance.late],
              ["Late", summary.monthAttendance.late],
              ["Leave", summary.monthAttendance.leave ?? 0],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="tnum text-[22px] font-bold leading-none text-ink">{value}</p>
                <p className="mt-1.5 text-[12.5px] text-ink-3">{label}</p>
              </div>
            ))}
          </div>
          <button type="button" className="mt-4 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => onView("attendance")}>
            See my attendance →
          </button>
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">Coming up</p>
          <div className="mt-2 divide-y divide-line">
            {coming.length ? coming.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 py-2.5">
                <p className="text-[13.5px] font-semibold text-ink">{c.title}</p>
                <p className="tnum text-[12px] text-ink-3">{c.sub}</p>
              </div>
            )) : <p className="py-2.5 text-[13.5px] text-ink-3">No leave or holidays coming up.</p>}
          </div>
          <button type="button" className="mt-3 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => onView("leave")}>
            Apply for leave →
          </button>
        </div>
      </div>

      {prompt ? (
        <div className="modal-scrim items-center justify-center p-4">
          <form className="card w-full max-w-md space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) punch(prompt, reason); }}>
            <h3 className="text-lg font-bold text-ink">{prompt === "check-in" ? "Checking in late" : "Leaving early"}</h3>
            <p className="text-sm text-ink-3">{prompt === "check-in" ? "Add a short reason for your admin." : "You haven't completed your hours yet. Add a short reason for your admin."}</p>
            <input autoFocus className="input" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={prompt === "check-in" ? "e.g. Traffic" : "e.g. Doctor's appointment"} />
            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-soft" onClick={() => { setPrompt(null); setReason(""); }}>Cancel</button>
              <button className="btn btn-primary" disabled={!reason.trim() || busy}>{prompt === "check-in" ? "Check in" : "Check out"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function PageTitle({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.035em] text-ink">{title}</h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-3">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function Badge({ value }: { value: string }) {
  return <span className={classNames("badge", statusTone(value))}>{value}</span>;
}

function DataTable<T extends { id: number }>({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: T[];
  columns: Array<[string, (row: T) => React.ReactNode]>;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="table-header">
            <tr>
              {columns.map(([label]) => (
                <th key={label} className="whitespace-nowrap px-5 py-2.5">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--line)" }}>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} className="bg-white transition-colors duration-150 hover:bg-[var(--surface-sunk)]">
                  {columns.map(([label, render]) => (
                    <td key={label} className="px-5 py-3 align-middle text-[13.5px] text-ink-2">
                      {render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-12 text-center text-[13.5px] text-ink-3" colSpan={columns.length}>
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"people" | "departments">("people");
  // Former employees are out of sight unless asked for.
  const [showFormer, setShowFormer] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    const data = await api<{ employees: Employee[]; departments: Department[]; designations: Designation[] }>("/employees");
    setEmployees(data.employees);
    setDepartments(data.departments);
    setDesignations(data.designations);
  }

  useEffect(() => { load().catch(console.error); }, []);

  const formerCount = employees.filter((e) => e.employment_status !== "Active").length;
  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return employees
      .filter((e) => showFormer || e.employment_status === "Active")
      .filter((e) => [e.full_name, e.email, e.employee_code].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => Number(b.employment_status === "Active") - Number(a.employment_status === "Active") || a.full_name.localeCompare(b.full_name));
  }, [employees, query, showFormer]);

  async function save(employee: Partial<Employee> & { password?: string }) {
    await api(editing ? `/employees/${editing.id}` : "/employees", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(employee),
    });
    setOpen(false);
    setEditing(null);
    await load();
  }

  return (
    <section className="space-y-5">
      <PageTitle
        title="People"
        description="Everyone on the team, and how the company is organised."
        action={tab === "people" ? (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus size={17} />Add employee
          </button>
        ) : undefined}
      />

      <Tabs value={tab} onChange={setTab} options={[["people", "Employees"], ["departments", "Departments"]]} />

      {tab === "people" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input className="input pl-9" placeholder="Search by name, email or ID" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {formerCount ? (
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
                <input type="checkbox" checked={showFormer} onChange={(e) => setShowFormer(e.target.checked)} />
                Show former employees ({formerCount})
              </label>
            ) : null}
          </div>

          <div className="card divide-y divide-line">
            {filtered.length ? filtered.map((row) => (
              <button key={row.id} type="button" onClick={() => { setEditing(row); setOpen(true); }}
                className={classNames("flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-[var(--surface-sunk)]",
                  row.employment_status !== "Active" && "opacity-60")}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-700">
                  {initialsOf(row.full_name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{row.full_name}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">
                    {[row.designation_name, row.department_name].filter(Boolean).join(" · ") || row.email}
                  </span>
                </span>
                <span className="hidden text-right sm:block">
                  <span className="tnum block text-[13.5px] font-semibold text-ink">{currency.format(row.monthly_salary)}</span>
                  <span className="code block text-[11.5px] text-ink-4">{row.employee_code}</span>
                </span>
                {row.employment_status !== "Active" ? <Badge value="Former" /> : null}
                <ChevronRight size={16} className="shrink-0 text-ink-4" />
              </button>
            )) : <p className="px-5 py-10 text-center text-[13.5px] text-ink-3">No one matches that search.</p>}
          </div>
        </>
      ) : <Departments />}

      {open ? (
        <EmployeeModal
          employee={editing}
          departments={departments}
          designations={designations}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSave={save}
        />
      ) : null}
    </section>
  );
}

// Two or three plain choices across the top of a page.
function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <div className="flex gap-1 border-b border-line">
      {options.map(([id, label]) => (
        <button key={id} type="button" onClick={() => onChange(id)}
          className={classNames("-mb-px border-b-2 px-3 py-2 text-[13.5px] font-semibold transition-colors duration-150",
            value === id ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {label}
        </button>
      ))}
    </div>
  );
}

function EmployeeModal({
  employee,
  departments,
  designations,
  onClose,
  onSave,
}: {
  employee: Employee | null;
  departments: Department[];
  designations: Designation[];
  onClose: () => void;
  onSave: (employee: Partial<Employee> & { password?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    employee_code: employee?.employee_code ?? "",
    full_name: employee?.full_name ?? "",
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    department_id: employee?.department_id ?? departments[0]?.id ?? "",
    designation_id: employee?.designation_id ?? designations[0]?.id ?? "",
    joining_date: employee?.joining_date ?? today,
    monthly_salary: employee?.monthly_salary ?? 0,
    employment_status: employee?.employment_status ?? "Active",
    address: employee?.address ?? "",
    bank_name: employee?.bank_name ?? "",
    account_number: employee?.account_number ?? "",
    ifsc_code: employee?.ifsc_code ?? "",
    password: "",
  });
  const [busy, setBusy] = useState(false);

  function update(name: string, value: string | number) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSave(form as Partial<Employee> & { password?: string });
    setBusy(false);
  }

  return (
    <div className="modal-scrim items-start justify-center overflow-y-auto p-4">
      <form onSubmit={submit} className="card my-8 w-full max-w-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink">{employee ? employee.full_name : "Add employee"}</h2>
            <p className="text-sm text-ink-3">{employee ? "Edit details, salary or login." : "They can sign in with this email and password."}</p>
          </div>
          <button type="button" aria-label="Close" className="rounded-lg p-1.5 text-ink-4 hover:bg-sunk" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Employee ID"><input required className="input" value={form.employee_code} onChange={(e) => update("employee_code", e.target.value)} /></Field>
          <Field label="Full name"><input required className="input" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} /></Field>
          <Field label="Email"><input required className="input" value={form.email} onChange={(e) => update("email", e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} /></Field>
          <Field label="Department">
            <select className="input" value={form.department_id} onChange={(e) => update("department_id", Number(e.target.value))}>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </Field>
          <Field label="Designation">
            <select className="input" value={form.designation_id} onChange={(e) => update("designation_id", Number(e.target.value))}>
              {designations.map((designation) => <option key={designation.id} value={designation.id}>{designation.name}</option>)}
            </select>
          </Field>
          <Field label="Joining date"><input type="date" className="input" value={form.joining_date} onChange={(e) => update("joining_date", e.target.value)} /></Field>
          <Field label="Monthly salary"><input type="number" className="input" value={form.monthly_salary} onChange={(e) => update("monthly_salary", Number(e.target.value))} /></Field>
          <Field label="Status">
            <select className="input" value={form.employment_status} onChange={(e) => update("employment_status", e.target.value)}>
              <option value="Active">Working here</option>
              <option value="Inactive">Left — hide everywhere</option>
            </select>
          </Field>
          <Field label={employee ? "Reset password" : "Login password"}><input className="input" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder={employee ? "Leave blank to keep current" : "password123"} /></Field>
        </div>
        <details className="mt-5 rounded-lg border border-line px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink-2">Bank details and address</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Bank name"><input className="input" value={form.bank_name} onChange={(e) => update("bank_name", e.target.value)} /></Field>
            <Field label="Account number"><input className="input" value={form.account_number} onChange={(e) => update("account_number", e.target.value)} /></Field>
            <Field label="IFSC code"><input className="input" value={form.ifsc_code} onChange={(e) => update("ifsc_code", e.target.value)} /></Field>
            <Field label="Address"><textarea className="input min-h-20" value={form.address} onChange={(e) => update("address", e.target.value)} /></Field>
          </div>
        </details>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function Departments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [departmentName, setDepartmentName] = useState("");
  const [designationName, setDesignationName] = useState("");
  const [message, setMessage] = useState("");
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [checkingEmployeesDept, setCheckingEmployeesDept] = useState<Department | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);

  async function load() {
    const data = await api<{ departments: Department[]; designations: Designation[] }>("/meta");
    setDepartments(data.departments);
    setDesignations(data.designations);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  useEffect(() => {
    if (checkingEmployeesDept && allEmployees.length === 0) {
      api<{ employees: Employee[] }>("/employees").then(d => setAllEmployees(d.employees)).catch(console.error);
    }
  }, [checkingEmployeesDept, allEmployees.length]);

  async function create(kind: "departments" | "designations", name: string) {
    setMessage("");
    try {
      await api(`/${kind}`, { method: "POST", body: JSON.stringify({ name }) });
      setDepartmentName("");
      setDesignationName("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save");
    }
  }

  async function remove(kind: "departments" | "designations", id: number) {
    setMessage("");
    try {
      await api(`/${kind}/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to delete");
    }
  }

  return (
    <section className="space-y-5">
      {message ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">{message}</div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <ManagerList title="Departments" value={departmentName} onValue={setDepartmentName} rows={departments} onCreate={() => create("departments", departmentName)} onDelete={(id) => remove("departments", id)} onEdit={setEditingDept} onCheckEmployees={setCheckingEmployeesDept} />
        <ManagerList title="Designations" value={designationName} onValue={setDesignationName} rows={designations} onCreate={() => create("designations", designationName)} onDelete={(id) => remove("designations", id)} onEdit={(row) => {
          const newName = window.prompt("Edit designation name:", row.name);
          if (newName && newName.trim() !== "") {
            api(`/designations/${row.id}`, { method: "PUT", body: JSON.stringify({ name: newName.trim() }) }).then(load).catch(err => alert(err.message));
          }
        }} />
      </div>

      {editingDept && (
        <div className="modal-scrim items-center justify-center p-4">
          <div className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Edit Department</h3>
            <p className="text-xs text-ink-3">Update {editingDept.name} and its shift hours. Leave shift fields blank to use the company default.</p>
            <Field label="Name">
              <input className="input" value={editingDept.name} onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full day hours">
                <input className="input" type="number" step="0.5" min="0" placeholder="e.g. 8" value={editingDept.shift_min_hours ?? ""} onChange={(e) => setEditingDept({ ...editingDept, shift_min_hours: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Half day hours">
                <input className="input" type="number" step="0.5" min="0" placeholder="e.g. 4" value={editingDept.half_day_min_hours ?? ""} onChange={(e) => setEditingDept({ ...editingDept, half_day_min_hours: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Late mark time">
              <input className="input" type="time" value={editingDept.late_mark_time ?? ""} onChange={(e) => setEditingDept({ ...editingDept, late_mark_time: e.target.value || null })} />
            </Field>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn btn-soft" onClick={() => setEditingDept(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={async () => {
                await api(`/departments/${editingDept.id}`, { method: "PUT", body: JSON.stringify(editingDept) });
                setEditingDept(null);
                await load();
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {checkingEmployeesDept && (
        <div className="modal-scrim items-center justify-center p-4">
          <div className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">{checkingEmployeesDept.name} Employees</h3>
            <p className="text-xs text-ink-3">All employees in the {checkingEmployeesDept.name} department</p>
            <div className="max-h-96 overflow-y-auto">
              {allEmployees.length === 0 ? (
                <div className="p-4 text-center text-ink-3">Loading...</div>
              ) : (
                <div className="space-y-2">
                  {allEmployees.filter((e) => e.department_id === checkingEmployeesDept.id).length === 0 ? (
                    <div className="p-4 text-center text-ink-3">No employees found in this department.</div>
                  ) : (
                    allEmployees.filter((e) => e.department_id === checkingEmployeesDept.id).map((emp) => {
                      const desig = designations.find(d => d.id === emp.designation_id)?.name || "Unknown Designation";
                      return (
                        <div key={emp.id} className="flex items-center justify-between rounded-lg border border-line bg-sunk p-3">
                          <div className="font-semibold text-ink">{emp.full_name}</div>
                          <div className="text-sm text-ink-3">{desig}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn btn-soft" onClick={() => setCheckingEmployeesDept(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ManagerList({
  title,
  value,
  onValue,
  rows,
  onCreate,
  onDelete,
  onEdit,
  onCheckEmployees,
}: {
  title: string;
  value: string;
  onValue: (value: string) => void;
  rows: Department[];
  onCreate: () => void;
  onDelete: (id: number) => void;
  onEdit?: (row: any) => void;
  onCheckEmployees?: (row: any) => void;
}) {
  return (
    <div className="card p-4">
      <h3 className="font-bold text-ink">{title}</h3>
      <div className="mt-4 flex gap-2">
        <input className="input" value={value} onChange={(event) => onValue(event.target.value)} placeholder={`Add ${title.toLowerCase()}`} />
        <button className="btn btn-primary" onClick={onCreate} disabled={!value.trim()}><Plus size={17} /></button>
      </div>
      <div className="mt-4 divide-y divide-line">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 py-3">
            <span className="font-semibold text-ink-2">{row.name}</span>
            <div className="flex shrink-0 gap-2">
              {onCheckEmployees ? <button type="button" className="btn btn-soft" onClick={() => onCheckEmployees(row)}>Employees</button> : null}
              {onEdit ? <button type="button" className="btn btn-soft" onClick={() => onEdit(row)}>Edit</button> : null}
              <button type="button" className="btn btn-soft" onClick={() => onDelete(row.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type GridDay = { day: string; status: string; factor: number; hours: number; check_in?: string | null; check_out?: string | null; note?: string; amount?: number };
type GridResponse = {
  month: number; year: number;
  employee: { id: number; full_name: string; joining_date: string; monthly_salary?: number };
  days: GridDay[];
  // Salary figures are only present for admins.
  summary: { totalDays: number; deductionDays: number; paidDays: number; perDay?: number; gross?: number; deductions?: number; net?: number };
  employees?: Employee[];
};

function dayTone(status: string) {
  if (["Present", "Holiday", "Paid leave", "Paid"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["Half day", "No check-in", "Half Day"].includes(status)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (["Absent", "Unpaid leave", "Unpaid", "Not joined", "Leave"].includes(status)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-sunk text-ink-2 border-line";
}

// Month day grid. On Attendance it shows attendance only; on Payroll (admin)
// it also shows the salary breakdown. Admin can override any single day.
// Controlled: the parent page owns month / year / employee so one selector drives everything.
function MonthGrid({ isAdmin, showSalary = false, month, year, employeeId, reloadKey = 0 }: {
  isAdmin: boolean; showSalary?: boolean; month: number; year: number; employeeId?: string; reloadKey?: number;
}) {
  const [data, setData] = useState<GridResponse | null>(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<GridDay | null>(null);
  const [override, setOverride] = useState({ day_type: "Auto", reason: "" });

  async function load() {
    setMessage("");
    try {
      const p = new URLSearchParams({ month: String(month), year: String(year) });
      if (isAdmin) {
        if (!employeeId) { setData(null); return; }
        p.set("employeeId", employeeId);
      }
      setData(await api<GridResponse>(`/attendance/month-grid?${p.toString()}`));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load");
    }
  }

  useEffect(() => { load(); }, [month, year, employeeId, reloadKey]);

  async function saveOverride(e: FormEvent) {
    e.preventDefault();
    if (!editing || !data) return;
    await api("/attendance/day-override", {
      method: "POST",
      body: JSON.stringify({ employee_id: data.employee.id, day: editing.day, day_type: override.day_type, reason: override.reason }),
    });
    setEditing(null);
    await load();
  }

  return (
    <div className="card p-5">
      <p className="text-xs text-ink-3">
        Per-day rate = monthly salary ÷ days in the month. Sundays, holidays and paid leave cost nothing.
      </p>

      {message ? <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700">{message}</div> : null}

      {data ? (
        <>
          {showSalary ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Days in month</p><p className="text-lg font-bold text-ink">{data.summary.totalDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Per day</p><p className="tnum text-lg font-bold text-ink">{currency.format(data.summary.perDay ?? 0)}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Paid days</p><p className="text-lg font-bold text-emerald-600">{data.summary.paidDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Deduction days</p><p className="text-lg font-bold text-rose-600">{data.summary.deductionDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Deductions</p><p className="tnum text-lg font-bold text-rose-600">-{currency.format(data.summary.deductions ?? 0)}</p></div>
              <div className="rounded-xl border-2 border-brand/30 bg-orange-50 p-3"><p className="text-[11px] font-semibold uppercase text-brand">Net payable</p><p className="tnum text-lg font-extrabold text-brand">{currency.format(data.summary.net ?? 0)}</p></div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Days in month</p><p className="text-lg font-bold text-ink">{data.summary.totalDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Present</p><p className="text-lg font-bold text-emerald-600">{data.days.filter((d) => d.status === "Present").length}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Half days</p><p className="text-lg font-bold text-amber-600">{data.days.filter((d) => d.status === "Half day" || d.status === "Half Day" || d.status === "No check-in").length}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Absent</p><p className="text-lg font-bold text-rose-600">{data.days.filter((d) => d.status === "Absent").length}</p></div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {data.days.map((d) => (
              <button
                key={d.day}
                type="button"
                disabled={!isAdmin}
                onClick={() => { setEditing(d); setOverride({ day_type: "Auto", reason: "" }); }}
                className={classNames("rounded-xl border p-2 text-left transition", dayTone(d.status), isAdmin && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer")}
                title={d.note || d.status}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold">{Number(d.day.slice(8, 10))}</span>
                  <span className="text-[10px] font-semibold">{new Date(d.day + "T00:00:00").toLocaleDateString("en", { weekday: "short" })}</span>
                </div>
                <p className="mt-1 truncate text-[11px] font-semibold">{d.status}</p>
                {d.check_in ? <p className="text-[10px] opacity-80">{d.check_in.slice(0, 5)}{d.check_out ? `–${d.check_out.slice(0, 5)}` : ""}</p> : null}
                {showSalary
                  ? (d.factor > 0 ? <p className="tnum text-[10px] font-bold">-{currency.format((data.summary.perDay ?? 0) * d.factor)}</p> : <p className="text-[10px] opacity-70">Paid</p>)
                  : (d.hours > 0 ? <p className="text-[10px] opacity-70">{d.hours.toFixed(1)}h</p> : null)}
              </button>
            ))}
          </div>
          {isAdmin ? <p className="mt-3 text-[11px] text-ink-4">Wrong? Click a day to count it as paid, half day or unpaid.</p> : null}
        </>
      ) : <p className="mt-4 text-sm text-ink-3">Select an employee to see the breakdown.</p>}

      {editing && isAdmin && (
        <div className="modal-scrim items-center justify-center p-4">
          <form onSubmit={saveOverride} className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Override {editing.day}</h3>
            <p className="text-xs text-ink-3">
              Currently <span className="font-semibold">{editing.status}</span>
              {editing.note ? ` · ${editing.note}` : ""}
              {editing.hours ? ` · ${editing.hours.toFixed(2)}h worked` : ""}
            </p>
            <Field label="Mark this day as">
              <select className="input" value={override.day_type} onChange={(e) => setOverride({ ...override, day_type: e.target.value })}>
                <option value="Auto">Auto (use attendance)</option>
                <option value="Paid">Paid — full day</option>
                <option value="Half Day">Half day</option>
                <option value="Unpaid">Unpaid — full deduction</option>
              </select>
            </Field>
            <Field label="Reason (optional)"><input className="input" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} placeholder="e.g. Approved comp-off" /></Field>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn btn-soft" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

type DayRequest = {
  id: number;
  employee_id: number;
  employee_name?: string;
  attendance_date: string;
  request_type: string;
  requested_check_in?: string | null;
  requested_check_out?: string | null;
  reason?: string;
  status: "Pending" | "Approved" | "Rejected";
  admin_note?: string | null;
};

// Employee raises a per-day correction; admin approves and it applies everywhere.
function DayRequests({ isAdmin }: { isAdmin: boolean }) {
  const [requests, setRequests] = useState<DayRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ attendance_date: today, request_type: "Timing", requested_check_in: "", requested_check_out: "", reason: "" });

  async function load() {
    try {
      const d = await api<{ requests: DayRequest[] }>("/attendance-requests");
      setRequests(d.requests);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load requests");
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/attendance-requests", { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ attendance_date: today, request_type: "Timing", requested_check_in: "", requested_check_out: "", reason: "" });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to submit request");
    }
    setBusy(false);
  }

  async function decide(id: number, status: "Approved" | "Rejected") {
    const admin_note = status === "Rejected" ? (window.prompt("Reason for rejection (optional)") ?? "") : "";
    await api(`/attendance-requests/${id}/decision`, { method: "POST", body: JSON.stringify({ status, admin_note }) });
    await load();
  }

  const pending = requests.filter((r) => r.status === "Pending").length;
  // Admins only need what is waiting on them; settled requests are history.
  const shown = isAdmin ? requests.filter((r) => r.status === "Pending") : requests.slice(0, 5);
  if (isAdmin && !shown.length) return null;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="font-bold text-ink">
          {isAdmin ? "Corrections to review" : "Something wrong with a day?"}
          {pending ? <span className="badge ml-2 bg-amber-50 text-amber-700">{pending} pending</span> : null}
        </h3>
        {!isAdmin ? <button type="button" className="btn btn-soft" onClick={() => setOpen(true)}><Plus size={16} />Request a correction</button> : null}
      </div>
      {message ? <div className="px-4 py-2 text-sm font-semibold text-amber-700">{message}</div> : null}
      {shown.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-sunk text-xs uppercase tracking-wide text-ink-3">
            <tr>
              {isAdmin ? <th className="px-4 py-3 font-bold">Employee</th> : null}
              <th className="px-4 py-3 font-bold">Date</th>
              <th className="px-4 py-3 font-bold">Type</th>
              <th className="px-4 py-3 font-bold">Requested</th>
              <th className="px-4 py-3 font-bold">Reason</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.length ? shown.map((r) => (
              <tr key={r.id} className="bg-white">
                {isAdmin ? <td className="px-4 py-3 font-semibold text-ink">{r.employee_name}</td> : null}
                <td className="px-4 py-3">{r.attendance_date}</td>
                <td className="px-4 py-3">{r.request_type}</td>
                <td className="px-4 py-3">{r.request_type === "Timing" ? `${r.requested_check_in || "—"} → ${r.requested_check_out || "—"}` : "—"}</td>
                <td className="px-4 py-3 text-ink-2">{r.reason || "—"}</td>
                <td className="px-4 py-3"><Badge value={r.status} /></td>
                <td className="px-4 py-3">
                  {isAdmin && r.status === "Pending" ? (
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-soft" onClick={() => decide(r.id, "Approved")}>Approve</button>
                      <button type="button" className="btn btn-soft" onClick={() => decide(r.id, "Rejected")}>Reject</button>
                    </div>
                  ) : (r.admin_note || "—")}
                </td>
              </tr>
            )) : (
              <tr><td className="px-4 py-8 text-center text-ink-3" colSpan={isAdmin ? 7 : 6}>No correction requests.</td></tr>
            )}
          </tbody>
        </table>
      </div> : null}

      {open && (
        <div className="modal-scrim items-center justify-center p-4">
          <form onSubmit={submit} className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Request attendance correction</h3>
            <p className="text-xs text-ink-3">Your admin will review this. Once approved it updates your attendance and salary automatically.</p>
            <Field label="Date"><input required className="input" type="date" value={form.attendance_date} onChange={(e) => setForm({ ...form, attendance_date: e.target.value })} /></Field>
            <Field label="What do you need?">
              <select className="input" value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })}>
                <option value="Timing">Fix check-in / check-out time (also for a missed check-out)</option>
                <option value="Half Day">Mark as half day</option>
                <option value="Full Day">Mark as full day (present)</option>
              </select>
            </Field>
            {form.request_type === "Timing" ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Check in"><input className="input" type="time" value={form.requested_check_in} onChange={(e) => setForm({ ...form, requested_check_in: e.target.value })} /></Field>
                <Field label="Check out"><input className="input" type="time" value={form.requested_check_out} onChange={(e) => setForm({ ...form, requested_check_out: e.target.value })} /></Field>
              </div>
            ) : null}
            <Field label="Reason"><textarea required className="input min-h-20" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why does this day need correcting?" /></Field>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn btn-soft" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Submitting..." : "Submit request"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const VIZ = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: "#b3aea5",
  single: "#ea580c",
  grid: "var(--line)",
};

const STATUS_COLOUR: Record<string, string> = {
  Present: VIZ.good,
  Late: VIZ.warning,
  "Half Day": VIZ.serious,
  Absent: VIZ.critical,
  "On Leave": VIZ.neutral,
};

// A month of attendance is a shape, not a list — so the month is drawn as a
// month. The table underneath still carries every detail for anyone auditing a
// particular day.
function AttendanceCalendar({ year, month, byDay, headcount, single, onDay }: {
  year: number; month: number;
  byDay: Map<string, AttendanceRecord[]>;
  headcount: number;
  single: boolean;
  onDay?: (date: string) => void;
}) {
  const days = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();

  return (
    <div className="card p-4">
      <div className="mb-3 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const date = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const records = byDay.get(date) ?? [];
          const isToday = date === today;
          const isSunday = new Date(year, month - 1, i + 1).getDay() === 0;
          const one = single ? records[0] : null;

          return (
            <button type="button" key={date} onClick={() => onDay?.(date)}
              title={records.length ? records.map((r) => `${r.employee_name ?? "You"}: ${attendanceLabel(r)}`).join("\n") : undefined}
              className={classNames(
                "min-h-[62px] rounded-lg border p-1.5 text-left align-top transition-colors duration-150 hover:border-line-strong",
                isToday ? "border-brand bg-brand-tint" : isSunday ? "border-line bg-sunk" : "border-line bg-white",
              )}>
              <div className="flex items-baseline justify-between">
                <span className={classNames("tnum text-[11px] font-semibold", isToday ? "text-brand" : "text-ink-2")}>{i + 1}</span>
                {isSunday ? <span className="text-[8.5px] font-medium uppercase text-ink-4">Off</span> : null}
              </div>

              {one ? (
                <div className="mt-1">
                  {/* A phone cell is ~38px wide — "Half Day" does not fit, so the
                      label gives way to the dot and the tooltip carries it. */}
                  <span className={classNames("badge hidden w-full justify-center !px-1 !text-[9px] sm:inline-flex", statusTone(one.status))}>
                    {one.missed_checkout ? "No check-out" : attendanceLabel(one)}
                  </span>
                  <span className="mx-auto block h-2 w-2 rounded-full sm:hidden"
                    style={{ background: STATUS_COLOUR[one.status] ?? VIZ.neutral }} />
                  {one.check_in ? <p className="tnum mt-1 text-center text-[9.5px] text-ink-3">{one.check_in.slice(0, 5)}</p> : null}
                </div>
              ) : records.length ? (
                <div className="mt-1.5">
                  <div className="flex flex-wrap gap-[3px]">
                    {records.slice(0, 8).map((r) => (
                      <span key={r.id} title={`${r.employee_name}: ${r.status}`}
                        className="h-[7px] w-[7px] rounded-full"
                        style={{ background: STATUS_COLOUR[r.status] ?? VIZ.neutral }} />
                    ))}
                  </div>
                  <p className="tnum mt-1 text-[9.5px] text-ink-3">
                    {records.filter((r) => r.status === "Present" || r.status === "Late").length}/{headcount || records.length} in
                  </p>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Status colours never carry meaning alone. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3" style={{ borderColor: "var(--line)" }}>
        {["Present", "Late", "Half Day", "Absent", "On Leave"].map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOUR[s] ?? VIZ.neutral }} />
            {s === "On Leave" ? "Leave" : s}
          </span>
        ))}
      </div>
    </div>
  );
}

// What a record is called on screen. A missed check-out is stored as leave, and
// says so.
function attendanceLabel(r: Pick<AttendanceRecord, "status" | "missed_checkout">) {
  if (r.status === "On Leave") return "Leave";
  return r.status;
}

// One picker for "whose", with former employees kept apart at the bottom.
function PersonPicker({ value, onChange, people, allLabel = "Everyone" }: {
  value: string; onChange: (id: string) => void; people: Employee[]; allLabel?: string;
}) {
  const current = people.filter((p) => p.employment_status === "Active");
  const former = people.filter((p) => p.employment_status !== "Active");
  return (
    <select className="input h-9 w-auto py-0 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {current.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      {former.length ? (
        <optgroup label="Former employees">
          {former.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </optgroup>
      ) : null}
    </select>
  );
}

// Month stepper shared by Attendance and Payroll.
function MonthStepper({ month, year, onChange, max }: { month: number; year: number; onChange: (m: number, y: number) => void; max: { month: number; year: number } }) {
  const atMax = year * 12 + month >= max.year * 12 + max.month;
  function step(by: number) {
    const d = new Date(year, month - 1 + by, 1);
    onChange(d.getMonth() + 1, d.getFullYear());
  }
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Previous month" className="btn btn-ghost px-2" onClick={() => step(-1)}><ChevronLeft size={17} /></button>
      <span className="min-w-[8.5rem] text-center text-[14px] font-semibold tracking-[-0.02em] text-ink">{monthNames[month - 1]} {year}</span>
      <button type="button" aria-label="Next month" className="btn btn-ghost px-2" disabled={atMax} onClick={() => step(1)}><ChevronRight size={17} /></button>
    </div>
  );
}

function Attendance({ isAdmin }: { isAdmin: boolean }) {
  const now = new Date();
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [employeeId, setEmployeeId] = useState("");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [form, setForm] = useState({ employee_id: 0, attendance_date: "", check_in: "", check_out: "", break_start: "", break_end: "", status: "Present" });

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  async function load() {
    const search = new URLSearchParams({ start: monthStart, end: monthEnd });
    if (isAdmin && employeeId) search.set("employeeId", employeeId);
    const data = await api<{ attendance: AttendanceRecord[]; employees?: Employee[] }>(`/attendance?${search.toString()}`);
    setRows(data.attendance);
    if (data.employees) setEmployees(data.employees);
  }

  useEffect(() => { load().catch(console.error); }, [month, year, employeeId]);

  const byDay = useMemo(() => {
    const m = new Map<string, AttendanceRecord[]>();
    for (const r of rows) m.set(r.attendance_date, [...(m.get(r.attendance_date) ?? []), r]);
    return m;
  }, [rows]);

  const tally = useMemo(() => {
    const t: Record<string, number> = { Present: 0, Late: 0, "Half Day": 0, Absent: 0, "On Leave": 0 };
    for (const r of rows) if (t[r.status] !== undefined) t[r.status] += 1;
    return t;
  }, [rows]);

  const single = !isAdmin || !!employeeId;
  const activePeople = employees.filter((e) => e.employment_status === "Active");
  const picked = employees.find((e) => String(e.id) === employeeId);

  function startEdit(r: AttendanceRecord) {
    setEditing(r);
    setForm({
      employee_id: r.employee_id, attendance_date: r.attendance_date,
      check_in: r.check_in ?? "", check_out: r.check_out ?? "",
      break_start: r.break_start ?? "", break_end: r.break_end ?? "",
      status: r.status,
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/attendance/manual", { method: "POST", body: JSON.stringify(form) });
      setEditing(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save");
    }
  }

  const dayRecords = openDay ? (byDay.get(openDay) ?? []) : [];
  // On the everyone-view, a day also lists who never checked in.
  const dayMissing = openDay && isAdmin && !employeeId
    ? activePeople.filter((p) => !dayRecords.some((r) => r.employee_id === p.id) && (!p.joining_date || p.joining_date <= openDay))
    : [];

  return (
    <section className="space-y-5">
      <PageTitle
        title="Attendance"
        description={isAdmin ? "Click any day to see who was in, and to fix a record." : "Your month at a glance. Click a day for its times."}
      />

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <MonthStepper month={month} year={year} max={{ month: now.getMonth() + 1, year: now.getFullYear() }}
          onChange={(m, y) => { setMonth(m); setYear(y); }} />
        {isAdmin ? <PersonPicker value={employeeId} onChange={setEmployeeId} people={employees} /> : null}
        <p className="tnum ml-auto text-[12.5px] text-ink-3">
          {single
            ? `${tally.Present + tally.Late} present · ${tally.Late} late · ${tally["Half Day"]} half · ${tally["On Leave"]} leave · ${tally.Absent} absent`
            : `${activePeople.length} people · ${rows.filter((r) => r.status === "Present" || r.status === "Late").length} check-ins this month`}
        </p>
      </div>

      {picked && picked.employment_status !== "Active" ? (
        <p className="text-[12.5px] font-medium text-ink-3">Showing a former employee.</p>
      ) : null}

      <AttendanceCalendar year={year} month={month} byDay={byDay} headcount={activePeople.length || 1} single={single} onDay={setOpenDay} />

      <DayRequests isAdmin={isAdmin} />

      {openDay ? (
        <div className="modal-scrim items-start justify-center overflow-y-auto p-4">
          <div className="card my-8 w-full max-w-lg p-6">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-bold text-ink">
                {new Date(`${openDay}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <button type="button" aria-label="Close" className="rounded-lg p-1.5 text-ink-4 hover:bg-sunk" onClick={() => setOpenDay(null)}><X size={20} /></button>
            </div>
            <div className="mt-4 divide-y divide-line">
              {dayRecords.map((r) => (
                <div key={r.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    {!single || isAdmin ? <p className="text-[13.5px] font-semibold text-ink">{r.employee_name ?? "You"}</p> : null}
                    <p className="tnum text-[12.5px] text-ink-3">
                      {r.check_in ? `In ${r.check_in.slice(0, 5)}` : "No check-in"}
                      {r.check_out ? ` · Out ${r.check_out.slice(0, 5)}` : ""}
                      {r.check_out ? ` · ${workedHMS(r)}` : ""}
                    </p>
                    {r.missed_checkout ? <p className="mt-0.5 text-[12px] font-medium text-rose-600">Didn't check out — counted as leave</p> : null}
                    {r.late_checkin_reason ? <p className="mt-0.5 text-[12px] text-amber-700">Late: {r.late_checkin_reason}</p> : null}
                    {r.early_checkout_reason ? <p className="mt-0.5 text-[12px] text-amber-700">Left early: {r.early_checkout_reason}</p> : null}
                  </div>
                  <Badge value={attendanceLabel(r)} />
                  {isAdmin ? <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => startEdit(r)}><Pencil size={13} />Edit</button> : null}
                </div>
              ))}
              {dayMissing.map((p) => (
                <div key={`m${p.id}`} className="flex items-center gap-3 py-3">
                  <p className="flex-1 text-[13.5px] font-semibold text-ink-3">{p.full_name}</p>
                  <span className="text-[12px] text-ink-4">No check-in</span>
                </div>
              ))}
              {!dayRecords.length && !dayMissing.length ? <p className="py-6 text-center text-[13.5px] text-ink-3">Nothing recorded for this day.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="modal-scrim items-center justify-center p-4">
          <form onSubmit={saveEdit} className="card w-full max-w-md space-y-4 p-6">
            <h3 className="text-lg font-bold text-ink">Fix {editing.employee_name}'s day</h3>
            <p className="text-xs text-ink-3">{editing.attendance_date}. Saving replaces what was recorded.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Check in"><input className="input" type="time" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></Field>
              <Field label="Check out"><input className="input" type="time" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></Field>
            </div>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Half Day">Half day</option>
                <option value="Absent">Absent</option>
                <option value="On Leave">Leave</option>
              </select>
            </Field>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn btn-soft" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

// The bell polls about once a minute; nothing else in the app polls.
const POLL = { notifications: 60000 };

// Runs `fn` on a timer, at a slower cadence once the tab is out of sight, and
// catches up the moment it comes back. A hiddenMs of 0 means "stop while hidden".
function usePolling(fn: () => void, visibleMs: number, hiddenMs = 0) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const start = () => {
      stop();
      const hidden = document.visibilityState !== "visible";
      if (hidden && !hiddenMs) return;
      timer = setInterval(() => saved.current(), hidden ? hiddenMs : visibleMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") saved.current();
      start();
    };
    saved.current();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [visibleMs, hiddenMs]);
}

function useNewVersionAvailable() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const loaded = document.querySelector<HTMLScriptElement>('script[type="module"]')?.getAttribute("src");
    if (!loaded) return;
    let alive = true;

    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const html = await (await fetch("/", { cache: "no-store" })).text();
        const served = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
        if (alive && served && served !== loaded) setStale(true);
      } catch { /* offline — ask again later */ }
    }

    const timer = setInterval(check, 120000);
    const onVisible = () => check();
    document.addEventListener("visibilitychange", onVisible);
    check();
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  return stale;
}

function shortTime(ts: string) {
  // Stored as UTC "YYYY-MM-DD HH:MM:SS"; render in the viewer's local time.
  const d = new Date(ts.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return ts.slice(11, 16);
  const todayStr = new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === todayStr ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

function initialsOf(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

type AppNotification = { id: number; title: string; message: string; is_read: number; created_at: string };

// Header bell — leave decisions, salary updates, task assignments, missed check-outs.
function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      const d = await api<{ notifications: AppNotification[]; unread: number }>("/notifications");
      setItems(d.notifications);
      setUnread(d.unread);
    } catch { /* keep last known list if a poll fails */ }
  }

  usePolling(load, POLL.notifications);

  async function markAllRead() {
    await api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
    await load();
  }

  return (
    <div className="relative">
      <button type="button" className="btn btn-soft relative" title="Notifications" onClick={() => setOpen((v) => !v)}>
        <Bell size={17} />
        {unread ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-line bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="font-bold text-ink">Notifications</h3>
              {unread ? <button type="button" className="text-xs font-semibold text-brand" onClick={markAllRead}>Mark all read</button> : null}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length ? items.map((n) => (
                <div key={n.id} className={classNames("border-b border-line px-4 py-3 last:border-0", !n.is_read && "bg-orange-50/60")}>
                  <p className="text-sm font-semibold text-ink">{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink-2">{n.message}</p>
                </div>
              )) : <p className="px-4 py-8 text-center text-sm text-ink-3">Nothing new.</p>}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

type WorkSpace = { id: number; name: string; color: string; status: string; requested_by?: number | null; list_count: number; task_count: number };
type WorkList = { id: number; space_id: number; name: string; space_name: string; status: string; requested_by?: number | null; task_count: number; done_count: number };
type WorkAssignee = { user_id: number; display_name: string };
type WorkTask = {
  id: number; list_id: number; list_name: string; space_name: string; space_id: number;
  title: string; description?: string | null; status: string; priority: string;
  start_date?: string | null; due_date?: string | null; due_time?: string | null; estimate_hours?: number | null;
  recurrence_id?: number | null;
  assignees: WorkAssignee[]; comment_count: number;
};
// A repeating task: the rule. Each day it applies arrives as an ordinary task.
type WorkRecurrence = {
  id: number; list_id: number; list_name: string; space_name: string;
  title: string; description?: string | null; priority: string;
  frequency: "weekly" | "monthly"; days_of_week: string | null; month_day: number | null;
  start_date: string; end_date: string | null; due_time: string | null;
  assignee_ids: number[]; active: number; created_by: number | null; created_by_name: string;
  next_date: string | null; done_count: number; made_count: number;
};
type WorkPerson = { id: number; display_name: string; role: string };
type WorkComment = { id: number; body: string; created_at: string; user_id: number; author_name: string };

const WORK_STATUSES = ["To Do", "In Progress", "In Review", "Done"];

// A colour per column, the way ClickUp tints its statuses.
const statusStyle: Record<string, string> = {
  "Backlog": "bg-sunk text-ink-2",
  "To Do": "bg-sky-50 text-sky-700",
  "In Progress": "bg-amber-50 text-amber-700",
  "In Review": "bg-violet-50 text-violet-700",
  "Done": "bg-emerald-50 text-emerald-700",
};

const statusBar: Record<string, string> = {
  "Backlog": "bg-ink-4",
  "To Do": "bg-sky-400",
  "In Progress": "bg-amber-400",
  "In Review": "bg-violet-400",
  "Done": "bg-emerald-400",
};

const priorityStyle: Record<string, { chip: string; bar: string }> = {
  Urgent: { chip: "bg-rose-100 text-rose-700", bar: "bg-rose-500" },
  High: { chip: "bg-orange-100 text-orange-700", bar: "bg-orange-500" },
  Normal: { chip: "bg-sunk text-ink-2", bar: "bg-ink-3" },
  Low: { chip: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-400" },
};

function dueTone(due?: string | null, status?: string) {
  if (!due || status === "Done") return "text-ink-4";
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
  if (diff < 0) return "text-rose-600 font-semibold";
  if (diff === 0) return "text-amber-600 font-semibold";
  return "text-ink-3";
}

// A finished task is never late, however long it sat there — saying "5d overdue"
// on something already done is just wrong.
function dueLabel(due?: string | null, status?: string, time?: string | null) {
  if (status === "Done") return due ? `Completed · due ${due}` : "Completed";
  if (!due) return "No due date";
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
  if (diff === 0) return time ? `Due today · ${time}` : "Due today";
  if (diff === 1) return time ? `Due tomorrow · ${time}` : "Due tomorrow";
  if (diff === -1) return "1 day overdue";
  if (diff < 0) return `${Math.abs(diff)} days overdue`;
  return time ? `${due} · ${time}` : due;
}

function isOverdue(task: { due_date?: string | null; status: string }) {
  return !!task.due_date && task.status !== "Done" && Date.parse(task.due_date) < Date.parse(today);
}

// A repeat created ahead of its day. It exists so the calendar can show what is
// coming, but it is not work anyone owes yet, so the board and list leave it out.
function isUpcomingRepeat(task: WorkTask) {
  return !!task.recurrence_id && !!task.due_date && task.due_date > today;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
// Monday first, the way a working week reads.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function ordinal(n: number) {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${tail}`;
}

function prettyDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

// "Mon–Sat at 10:00 · until 31 Oct" — the whole rule in one line.
function describeRepeat(r: { frequency: string; days_of_week: string | null; month_day: number | null; due_time: string | null; end_date: string | null }) {
  let when: string;
  if (r.frequency === "monthly") {
    when = `Monthly on the ${ordinal(Number(r.month_day) || 1)}`;
  } else {
    const days = String(r.days_of_week ?? "").split(",").filter(Boolean).map(Number);
    const key = [...days].sort().join(",");
    if (key === "0,1,2,3,4,5,6") when = "Every day";
    else if (key === "1,2,3,4,5,6") when = "Mon–Sat";
    else if (key === "1,2,3,4,5") when = "Weekdays";
    else when = WEEK_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(", ");
  }
  return `${when}${r.due_time ? ` at ${r.due_time}` : ""}${r.end_date ? ` · until ${prettyDate(r.end_date)}` : ""}`;
}

// Urgent first, then whatever is due soonest — undated work sinks to the bottom.
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
// Whatever else is true, something already finished belongs below work that
// still needs doing — it should drop the moment you mark it Done.
function doneLast(a: WorkTask, b: WorkTask) {
  return Number(a.status === "Done") - Number(b.status === "Done");
}

function byPriorityThenDue(a: WorkTask, b: WorkTask) {
  const finished = doneLast(a, b);
  if (finished !== 0) return finished;
  const rank = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  if (rank !== 0) return rank;
  if (!a.due_date && !b.due_date) return b.id - a.id;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date) || b.id - a.id;
}


// A small labelled flag, so priority is readable in every view rather than a
// coloured dot you have to hover to decode.
function PriorityTag({ priority, compact }: { priority: string; compact?: boolean }) {
  return (
    <span className={classNames(
      "inline-flex shrink-0 items-center gap-1 rounded-full font-bold uppercase tracking-wide",
      compact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]",
      priorityStyle[priority]?.chip,
    )}>
      <span className={classNames("h-1.5 w-1.5 rounded-full", priorityStyle[priority]?.bar)} />
      {priority}
    </span>
  );
}

type PickerOption = { id: number; label: string; hint?: string };

// One compact control instead of a row of chips: click to open, type to search.
function SearchSelect({ label, value, options, allLabel, placeholder, onChange, disabled, trailing }: {
  label: string;
  value: number;
  options: PickerOption[];
  allLabel: string;
  placeholder?: string;
  onChange: (id: number) => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.id === value);
  const matches = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="relative">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-4">{label}</p>
      <div className="flex items-center gap-1">
        <button type="button" disabled={disabled} onClick={() => { setOpen((v) => !v); setQuery(""); }}
          className={classNames(
            "flex h-9 min-w-[9rem] items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
            disabled ? "cursor-not-allowed border-line bg-sunk text-ink-4" : "border-line bg-white text-ink-2 hover:border-line-strong",
          )}>
          <span className="min-w-0 flex-1 truncate text-left">{selected ? selected.label : allLabel}</span>
          <ChevronDown size={14} className="shrink-0 text-ink-4" />
        </button>
        {trailing}
      </div>

      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
            <div className="border-b border-line p-2">
              <input autoFocus className="input h-8 py-0 text-sm" placeholder={placeholder ?? "Search…"}
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              <button type="button" onClick={() => { onChange(0); setOpen(false); }}
                className={classNames("flex w-full px-3 py-2 text-left text-sm", !value ? "bg-orange-50 font-semibold text-brand" : "text-ink-2 hover:bg-sunk")}>
                {allLabel}
              </button>
              {matches.map((o) => (
                <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                  className={classNames("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", o.id === value ? "bg-orange-50 font-semibold text-brand" : "text-ink-2 hover:bg-sunk")}>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint ? <span className="shrink-0 text-[11px] text-ink-4">{o.hint}</span> : null}
                </button>
              ))}
              {!matches.length ? <p className="px-3 py-4 text-center text-xs text-ink-4">No match.</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Tasks({ isAdmin }: { isAdmin: boolean }) {
  const [spaces, setSpaces] = useState<WorkSpace[]>([]);
  const [lists, setLists] = useState<WorkList[]>([]);
  const [people, setPeople] = useState<WorkPerson[]>([]);
  const [formerPeople, setFormerPeople] = useState<WorkPerson[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  // The view you last chose is the one you get next time.
  const [view, setView] = useState<"board" | "list" | "calendar">(() => {
    const saved = localStorage.getItem("fast_hrms_task_view");
    return saved === "list" || saved === "calendar" || saved === "board" ? saved : "board";
  });
  const [query, setQuery] = useState("");
  const [dueFilter, setDueFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [spaceId, setSpaceId] = useState(0);
  const [listId, setListId] = useState(0);
  const [mine, setMine] = useState(!isAdmin);
  const [assigneeId, setAssigneeId] = useState(0);
  const [message, setMessage] = useState("");
  const [openTask, setOpenTask] = useState<WorkTask | null>(null);
  const [newOpen, setNewOpen] = useState<{ status: string; listId: string } | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newListFor, setNewListFor] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ kind: "spaces" | "lists"; id: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Adding a task should not always cost a modal: type a title into the column
  // and press Enter. The full form stays on the header button for detail.
  const [quickAddIn, setQuickAddIn] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [seriesOpen, setSeriesOpen] = useState(false);

  async function loadMeta() {
    const m = await api<{ spaces: WorkSpace[]; lists: WorkList[]; people: WorkPerson[]; formerPeople?: WorkPerson[] }>("/work/meta");
    setSpaces(m.spaces); setLists(m.lists); setPeople(m.people); setFormerPeople(m.formerPeople ?? []);
  }

  async function loadTasks() {
    const p = new URLSearchParams();
    if (listId) p.set("listId", String(listId));
    else if (spaceId) p.set("spaceId", String(spaceId));
    if (mine) p.set("mine", "1");
    if (assigneeId) p.set("assigneeId", String(assigneeId));
    const d = await api<{ tasks: WorkTask[] }>(`/work/tasks?${p.toString()}`);
    setTasks(d.tasks);
  }

  async function refresh() {
    try { await loadTasks(); } catch (err) { setMessage(err instanceof Error ? err.message : "Failed to load tasks"); }
  }

  useEffect(() => { localStorage.setItem("fast_hrms_task_view", view); }, [view]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape" && el === searchRef.current) { setQuery(""); searchRef.current?.blur(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { loadMeta().catch(() => undefined); }, []);
  useEffect(() => { refresh(); }, [spaceId, listId, mine, assigneeId]);

  // Only approved spaces/lists hold work; pending ones just wait for a decision.
  const activeSpaces = spaces.filter((s) => s.status === "Active");
  const activeLists = lists.filter((l) => l.status === "Active");
  // Picking a space narrows the list row to that space — no "Space › List" labels.
  const visibleLists = spaceId ? activeLists.filter((l) => l.space_id === spaceId) : activeLists;
  const pending = [
    ...spaces.filter((s) => s.status === "Pending").map((s) => ({ kind: "spaces" as const, id: s.id, label: `Space · ${s.name}` })),
    ...lists.filter((l) => l.status === "Pending").map((l) => ({ kind: "lists" as const, id: l.id, label: `List · ${l.space_name} › ${l.name}` })),
  ];

  const scopeLabel = listId
    ? (() => { const l = activeLists.find((x) => x.id === listId); return l ? `${l.space_name} › ${l.name}` : "All work"; })()
    : spaceId ? (activeSpaces.find((s) => s.id === spaceId)?.name ?? "All work") : "All work";

  // Which list a quick-add lands in. Only guess when there is nothing to guess
  // between — otherwise the full form asks, since the list is compulsory.
  const defaultListId = listId ? String(listId)
    : spaceId ? String(activeLists.find((l) => l.space_id === spaceId)?.id ?? "")
    : activeLists.length === 1 ? String(activeLists[0].id)
    : "";

  async function decide(kind: "spaces" | "lists", id: number, status: "Active" | "Rejected") {
    try {
      await api(`/work/${kind}/${id}/decision`, { method: "POST", body: JSON.stringify({ status }) });
      await loadMeta();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not save decision"); }
  }

  function startEdit(kind: "spaces" | "lists", id: number, name: string) {
    setEditing({ kind, id }); setDraft(name);
  }

  async function commitEdit() {
    const target = editing;
    setEditing(null);
    if (!target || !draft.trim()) return;
    try {
      await api(`/work/${target.kind}/${target.id}`, { method: "PUT", body: JSON.stringify({ name: draft.trim() }) });
      await loadMeta(); await refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not rename"); }
  }

  async function remove(kind: "spaces" | "lists", id: number, warning: string) {
    if (!window.confirm(warning)) return;
    try {
      await api(`/work/${kind}/${id}`, { method: "DELETE" });
      if (kind === "spaces" && spaceId === id) { setSpaceId(0); setListId(0); }
      if (kind === "lists" && listId === id) setListId(0);
      await loadMeta(); await refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not delete"); }
  }

  async function quickAdd(status: string) {
    const title = quickTitle.trim();
    if (!title || !defaultListId) return;
    setQuickBusy(true);
    try {
      await api("/work/tasks", { method: "POST", body: JSON.stringify({ list_id: Number(defaultListId), title, status }) });
      setQuickTitle("");
      await refresh();
      await loadMeta();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add that task");
    }
    setQuickBusy(false);
  }

  async function setStatus(task: WorkTask, status: string) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await api(`/work/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ status }) });
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not update"); }
    await refresh();
  }

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const startOfWeek = Date.parse(today);
    return tasks
      .filter((t) => {
        if (view !== "calendar" && isUpcomingRepeat(t)) return false;
        if (needle && !`${t.title} ${t.description ?? ""} ${t.list_name}`.toLowerCase().includes(needle)) return false;
        if (priorityFilter && t.priority !== priorityFilter) return false;
        if (hideDone && t.status === "Done") return false;
        if (dueFilter) {
          const due = t.due_date ? Date.parse(t.due_date) : null;
          if (dueFilter === "overdue" && !isOverdue(t)) return false;
          if (dueFilter === "today" && (!due || due !== startOfWeek)) return false;
          if (dueFilter === "week" && (!due || due < startOfWeek || due > startOfWeek + 7 * 86400000)) return false;
          if (dueFilter === "none" && t.due_date) return false;
        }
        return true;
      })
      .sort(byPriorityThenDue);
  }, [tasks, query, dueFilter, priorityFilter, hideDone, view]);
  const upcomingRepeats = view === "calendar" ? 0 : tasks.filter(isUpcomingRepeat).length;

  const grouped = useMemo(() => {
    const map: Record<string, WorkTask[]> = {};
    for (const s of WORK_STATUSES) map[s] = [];
    for (const t of visibleTasks) (map[t.status] ??= []).push(t);
    return map;
  }, [visibleTasks]);

  const filtersOn = !!(query.trim() || dueFilter || priorityFilter || hideDone);

  function clearFilters() {
    setQuery(""); setDueFilter(""); setPriorityFilter(""); setHideDone(false);
  }

  const done = visibleTasks.filter((t) => t.status === "Done").length;
  const overdue = visibleTasks.filter(isOverdue).length;

  const nameInput = (
    <input autoFocus className="input h-7 w-40 py-0 text-xs" value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commitEdit} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(null); }} />
  );

  return (
    <section className="space-y-4">
      <PageTitle
        title="Tasks"
        description={isAdmin ? "Every task lives in a list, and every list in a space." : "Your work, and anything raised for you."}
        action={(
          <span className="flex gap-2">
            <button type="button" className="btn btn-soft" onClick={() => setSeriesOpen(true)}>
              <Repeat size={15} />Repeating
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setNewOpen({ status: "To Do", listId: defaultListId })}>
              <Plus size={16} />New task
            </button>
          </span>
        )}
      />
      {message ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{message}</div> : null}

      {/* Requests waiting on the admin, or your own still in the queue. */}
      {pending.length ? (
        <div className="card space-y-2 border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{isAdmin ? "Waiting for your approval" : "Your requests"}</p>
          {pending.map((r) => (
            <div key={`${r.kind}${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
              <span className="text-sm font-semibold text-ink">{r.label}</span>
              {isAdmin ? (
                <span className="flex gap-2">
                  <button type="button" className="btn btn-soft py-1 text-emerald-700" onClick={() => decide(r.kind, r.id, "Active")}>Approve</button>
                  <button type="button" className="btn btn-soft py-1 text-rose-600" onClick={() => decide(r.kind, r.id, "Rejected")}>Reject</button>
                </span>
              ) : <span className="badge bg-amber-100 text-amber-700">Awaiting approval</span>}
            </div>
          ))}
        </div>
      ) : null}

      {/* Everything you steer the board with sits together, right under the title. */}
      <div className="card divide-y divide-line">
        <div className="flex flex-wrap items-end gap-3 p-3">
          <SearchSelect
            label="Space" allLabel="All spaces" placeholder="Search spaces…"
            value={spaceId} options={activeSpaces.map((sp) => ({ id: sp.id, label: sp.name }))}
            onChange={(id) => { setSpaceId(id); setListId(0); }}
            trailing={isAdmin && spaceId ? (
              <>
                <button type="button" aria-label="Rename space" className="rounded p-1 text-ink-4 hover:text-ink"
                  onClick={() => { const sp = activeSpaces.find((x) => x.id === spaceId); if (sp) startEdit("spaces", sp.id, sp.name); }}><Pencil size={13} /></button>
                <button type="button" aria-label="Delete space" className="rounded p-1 text-ink-4 hover:text-rose-600"
                  onClick={() => { const sp = activeSpaces.find((x) => x.id === spaceId); if (sp) remove("spaces", sp.id, `Delete the space "${sp.name}"? This also deletes ${sp.list_count} list(s) and ${sp.task_count} task(s).`); }}><Trash2 size={13} /></button>
              </>
            ) : undefined}
          />

          <SearchSelect
            label="List" allLabel="All lists" placeholder="Search lists…"
            value={listId} options={visibleLists.map((l) => ({ id: l.id, label: l.name, hint: l.task_count ? String(l.task_count) : undefined }))}
            onChange={(id) => { setListId(id); const l = activeLists.find((x) => x.id === id); if (l) setSpaceId(l.space_id); }}
            trailing={isAdmin && listId ? (
              <>
                <button type="button" aria-label="Rename list" className="rounded p-1 text-ink-4 hover:text-ink"
                  onClick={() => { const l = activeLists.find((x) => x.id === listId); if (l) startEdit("lists", l.id, l.name); }}><Pencil size={13} /></button>
                <button type="button" aria-label="Delete list" className="rounded p-1 text-ink-4 hover:text-rose-600"
                  onClick={() => { const l = activeLists.find((x) => x.id === listId); if (l) remove("lists", l.id, `Delete the list "${l.name}"? This also deletes its ${l.task_count} task(s).`); }}><Trash2 size={13} /></button>
              </>
            ) : undefined}
          />

          {isAdmin ? (
            <SearchSelect
              label="Assignee" allLabel="Everyone" placeholder="Search people…"
              value={assigneeId} options={[
                ...people.map((pp) => ({ id: pp.id, label: pp.display_name })),
                ...formerPeople.map((pp) => ({ id: pp.id, label: pp.display_name, hint: "former" })),
              ]}
              onChange={(id) => { setAssigneeId(id); if (id) setMine(false); }}
            />
          ) : null}

          {editing ? <div className="self-end pb-1">{nameInput}</div> : null}

          <div className="ml-auto flex items-end gap-2">
            <button type="button" onClick={() => setNewSpaceOpen(true)}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-ink-4 transition hover:text-brand">
              <Plus size={13} />{isAdmin ? "Space" : "Request space"}
            </button>
            <button type="button" onClick={() => setNewListFor(spaceId || activeSpaces[0]?.id || 0)}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-ink-4 transition hover:text-brand">
              <Plus size={13} />{isAdmin ? "List" : "Request list"}
            </button>
          </div>
        </div>

        {/* Find a task by name, or narrow by how urgent it is and when it is due. */}
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input ref={searchRef} className="input h-9 py-0 pl-8 text-sm" placeholder="Search tasks…"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="input h-9 w-auto py-0 text-sm" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">Any priority</option>
            {["Urgent", "High", "Normal", "Low"].map((p2) => <option key={p2} value={p2}>{p2}</option>)}
          </select>
          <select className="input h-9 w-auto py-0 text-sm" value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}>
            <option value="">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="week">Due this week</option>
          </select>
          {filtersOn ? (
            <button type="button" className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-3 hover:text-brand" onClick={clearFilters}>
              Clear
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{scopeLabel}</p>
            <p className="text-xs text-ink-4">
              {visibleTasks.length - done} open{done ? ` · ${done} done` : ""}{overdue ? ` · ${overdue} overdue` : ""}
              {filtersOn ? ` · filtered from ${tasks.length}` : ""}
              {upcomingRepeats ? ` · ${upcomingRepeats} upcoming repeat${upcomingRepeats === 1 ? "" : "s"} on the calendar` : ""}
            </p>
          </div>
          {isAdmin ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-2">
              <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); if (e.target.checked) setAssigneeId(0); }} />
              My tasks
            </label>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-2">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            Hide done
          </label>
          <div className="ml-auto flex gap-1 rounded-full bg-sunk p-1">
            {(["board", "list", "calendar"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={classNames("rounded-full px-3 py-1 text-xs font-semibold capitalize transition",
                  view === v ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Board columns scroll sideways rather than wrapping into a ragged grid. */}
      {view === "board" ? (
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {WORK_STATUSES.map((status) => (
            <div key={status}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOver !== status) setDragOver(status); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((d) => (d === status ? null : d)); }}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId ?? Number(e.dataTransfer.getData("text/plain"));
                const t = visibleTasks.find((x) => x.id === id) ?? tasks.find((x) => x.id === id);
                if (t && t.status !== status) setStatus(t, status);
                setDragId(null); setDragOver(null);
              }}
              className={classNames(
                "flex w-[240px] shrink-0 grow flex-col rounded-xl border p-2 transition-colors duration-150",
                dragOver === status
                  ? "border-brand/40 bg-[var(--brand-tint)]"
                  : "border-[var(--line)] bg-[var(--surface-sunk)]",
              )}>
              <div className="flex items-center gap-2 px-1 pb-2">
                <span className={classNames("h-1.5 w-1.5 rounded-full", statusBar[status])} />
                <span className="text-xs font-bold uppercase tracking-wide text-ink-3">{status}</span>
                <span className="ml-auto text-xs text-ink-4">{grouped[status]?.length ?? 0}</span>
              </div>
              <div className="flex-1 space-y-2">
                {(grouped[status] ?? []).map((t) => (
                  <div key={t.id} role="button" tabIndex={0} draggable
                    onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(t.id)); }}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    onClick={() => setOpenTask(t)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenTask(t); } }}
                    className={classNames(
                      "w-full cursor-grab rounded-xl border border-line p-3 text-left transition hover:border-line-strong hover:shadow-sm active:cursor-grabbing",
                      t.status === "Done" ? "bg-sunk" : "bg-white",
                      dragId === t.id && "opacity-40",
                    )}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <PriorityTag priority={t.priority} compact />
                      {t.recurrence_id ? <Repeat size={11} className="text-ink-4" aria-label="Repeating task" /> : null}
                      {isOverdue(t) ? <span className="rounded-full bg-rose-100 px-1.5 text-[9px] font-bold uppercase text-rose-700">Late</span> : null}
                    </div>
                    <p className={classNames("text-sm font-semibold leading-snug", t.status === "Done" ? "text-ink-4 line-through decoration-slate-300" : "text-ink")}>{t.title}</p>
                    {!listId ? <p className="mt-1 truncate text-[11px] text-ink-4">{t.list_name}</p> : null}
                    <div className="mt-2 flex items-center gap-2">
                      <span className={classNames("truncate text-[11px]", dueTone(t.due_date, t.status))}>{dueLabel(t.due_date, t.status, t.due_time)}</span>
                      {t.comment_count ? <span className="text-[11px] text-ink-4">💬 {t.comment_count}</span> : null}
                      <span className="ml-auto flex -space-x-1">
                        {t.assignees.slice(0, 3).map((a) => (
                          <span key={a.user_id} title={a.display_name} className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700 ring-1 ring-white">
                            {initialsOf(a.display_name)}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                ))}
                {quickAddIn === status ? (
                  <div className="rounded-xl border border-brand bg-white p-2">
                    <textarea autoFocus rows={2} value={quickTitle} disabled={quickBusy}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); quickAdd(status); }
                        if (e.key === "Escape") { setQuickAddIn(null); setQuickTitle(""); }
                      }}
                      placeholder="What needs doing?"
                      className="w-full resize-none border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4" />
                    <div className="mt-1 flex items-center gap-2">
                      <button type="button" className="btn btn-primary px-3 py-1 text-xs" disabled={quickBusy || !quickTitle.trim()} onClick={() => quickAdd(status)}>
                        {quickBusy ? "Adding…" : "Add"}
                      </button>
                      <button type="button" className="text-xs font-semibold text-ink-4 hover:text-ink" onClick={() => { setQuickAddIn(null); setQuickTitle(""); }}>Cancel</button>
                      <button type="button" className="ml-auto text-[11px] font-semibold text-ink-4 hover:text-brand"
                        onClick={() => { setNewOpen({ status, listId: defaultListId }); setQuickAddIn(null); setQuickTitle(""); }}>
                        More options
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button"
                    onClick={() => (defaultListId ? (setQuickAddIn(status), setQuickTitle("")) : setNewOpen({ status, listId: defaultListId }))}
                    className="flex w-full items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-ink-4 transition hover:bg-white hover:text-brand">
                    <Plus size={13} />Task
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-sunk text-[11px] uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-4 py-3 font-bold">Task</th>
                  <th className="px-4 py-3 font-bold">Priority</th>
                  <th className="px-4 py-3 font-bold">List</th>
                  <th className="px-4 py-3 font-bold">Assignees</th>
                  <th className="px-4 py-3 font-bold">Due</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibleTasks.length ? visibleTasks.map((t, i) => (
                  <Fragment key={t.id}>
                    {/* Where the finished work starts, say so rather than leaving
                        the reader to notice the statuses changed. */}
                    {t.status === "Done" && visibleTasks[i - 1]?.status !== "Done" ? (
                      <tr className="bg-sunk/70">
                        <td colSpan={6} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-4">
                          Completed · {visibleTasks.filter((x) => x.status === "Done").length}
                        </td>
                      </tr>
                    ) : null}
                  <tr className={classNames("cursor-pointer hover:bg-sunk", t.status === "Done" ? "bg-sunk/40" : "bg-white")} onClick={() => setOpenTask(t)}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className={classNames("font-semibold", t.status === "Done" ? "text-ink-4 line-through decoration-slate-300" : "text-ink")}>{t.title}</span>
                        {t.recurrence_id ? <Repeat size={12} className="shrink-0 text-ink-4" aria-label="Repeating task" /> : null}
                        {t.comment_count ? <span className="text-[11px] text-ink-4">💬 {t.comment_count}</span> : null}
                      </span>
                    </td>
                    <td className={classNames("px-4 py-3", t.status === "Done" && "opacity-50")}><PriorityTag priority={t.priority} /></td>
                    <td className="px-4 py-3 text-xs text-ink-3">{t.list_name}</td>
                    <td className="px-4 py-3">
                      <span className="flex -space-x-1">
                        {t.assignees.map((a) => (
                          <span key={a.user_id} title={a.display_name} className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700 ring-1 ring-white">{initialsOf(a.display_name)}</span>
                        ))}
                        {!t.assignees.length ? <span className="text-xs text-ink-4">—</span> : null}
                      </span>
                    </td>
                    <td className={classNames("px-4 py-3 text-xs", dueTone(t.due_date, t.status))}>{dueLabel(t.due_date, t.status, t.due_time)}</td>
                    <td className="px-4 py-3">
                      <select className={classNames("input h-8 w-auto py-0 text-xs font-semibold", statusStyle[t.status])}
                        value={t.status} onClick={(e) => e.stopPropagation()} onChange={(e) => setStatus(t, e.target.value)}>
                        {WORK_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                  </Fragment>
                )) : <tr><td className="px-4 py-10 text-center text-ink-3" colSpan={6}>{filtersOn ? "No task matches those filters." : "Nothing here yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {view === "calendar" ? <WorkCalendar tasks={visibleTasks} onOpen={setOpenTask} /> : null}

      {openTask ? (
        <WorkTaskModal task={openTask} isAdmin={isAdmin} people={people} spaces={activeSpaces} lists={activeLists}
          onClose={() => setOpenTask(null)} onChanged={async () => { await refresh(); setOpenTask(null); }} />
      ) : null}

      {newOpen ? (
        <WorkTaskForm spaces={activeSpaces} lists={activeLists} people={people} initial={newOpen} onClose={() => setNewOpen(null)}
          onSaved={async () => { setNewOpen(null); await refresh(); await loadMeta(); }} />
      ) : null}

      {seriesOpen ? (
        <RecurringPanel isAdmin={isAdmin} spaces={activeSpaces} lists={activeLists} people={people}
          onClose={() => setSeriesOpen(false)} onChanged={refresh} />
      ) : null}

      {newSpaceOpen ? (
        <NewSpaceForm isAdmin={isAdmin} onClose={() => setNewSpaceOpen(false)}
          onSaved={async () => { setNewSpaceOpen(false); await loadMeta(); }} />
      ) : null}

      {newListFor !== null ? (
        <NewListForm isAdmin={isAdmin} spaces={activeSpaces} initialSpaceId={newListFor} onClose={() => setNewListFor(null)}
          onSaved={async () => { setNewListFor(null); await loadMeta(); }} />
      ) : null}
    </section>
  );
}
// Month grid of tasks placed on their due date.
function WorkCalendar({ tasks, onOpen }: { tasks: WorkTask[]; onOpen: (t: WorkTask) => void }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const days = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const byDay = useMemo(() => {
    const m: Record<string, WorkTask[]> = {};
    for (const t of tasks) if (t.due_date) (m[t.due_date] ??= []).push(t);
    // Within a day, the most urgent work sits at the top of the cell.
    for (const day of Object.keys(m)) m[day].sort(byPriorityThenDue);
    return m;
  }, [tasks]);

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Month">
          <select className="input h-10 py-1" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Field>
        <Field label="Year"><input className="input h-10 w-24 py-1" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-ink-4">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const list = byDay[day] ?? [];
          return (
            <div key={day} className={classNames("min-h-[86px] rounded-lg border p-1", day === today ? "border-brand bg-orange-50/40" : "border-line")}>
              <p className="px-1 text-[11px] font-bold text-ink-3">{i + 1}</p>
              <div className="space-y-1">
                {list.slice(0, 3).map((t) => (
                  <button key={t.id} type="button" onClick={() => onOpen(t)}
                    title={`${t.priority} · ${t.title}`}
                    className={classNames("flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-semibold", statusStyle[t.status])}>
                    {/* The priority stripe carries into the calendar too. */}
                    <span className={classNames("h-2.5 w-1 shrink-0 rounded-full", priorityStyle[t.priority]?.bar)} />
                    <span className="min-w-0 flex-1 truncate">{t.due_time ? `${t.due_time} ` : ""}{t.title}</span>
                    {t.recurrence_id ? <Repeat size={9} className="shrink-0 opacity-60" /> : null}
                  </button>
                ))}
                {list.length > 3 ? <p className="px-1 text-[10px] text-ink-4">+{list.length - 3} more</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Task detail: admins edit everything, employees move status and comment.
function WorkTaskModal({ task, isAdmin, people, spaces, lists, onClose, onChanged }: {
  task: WorkTask; isAdmin: boolean; people: WorkPerson[]; spaces: WorkSpace[]; lists: WorkList[];
  onClose: () => void; onChanged: () => void;
}) {
  const [form, setForm] = useState({
    title: task.title, description: task.description ?? "", status: task.status, priority: task.priority,
    due_date: task.due_date ?? "", due_time: task.due_time ?? "", list_id: String(task.list_id),
    assignees: task.assignees.map((a) => a.user_id),
  });
  const [spaceId, setSpaceId] = useState(task.space_id);
  const modalLists = lists.filter((l) => l.space_id === spaceId);
  const [comments, setComments] = useState<WorkComment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadComments() {
    const d = await api<{ comments: WorkComment[] }>(`/work/tasks/${task.id}/comments`);
    setComments(d.comments);
  }
  useEffect(() => { loadComments().catch(() => undefined); }, [task.id]);

  async function save() {
    setBusy(true);
    await api(`/work/tasks/${task.id}`, { method: "PUT", body: JSON.stringify(isAdmin ? form : { status: form.status }) }).catch(() => undefined);
    setBusy(false);
    onChanged();
  }

  async function comment(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    await api(`/work/tasks/${task.id}/comments`, { method: "POST", body: JSON.stringify({ body: draft }) });
    setDraft("");
    await loadComments();
  }

  async function remove() {
    if (!window.confirm("Delete this task?")) return;
    await api(`/work/tasks/${task.id}`, { method: "DELETE" });
    onChanged();
  }

  function toggleAssignee(id: number) {
    setForm((f) => ({ ...f, assignees: f.assignees.includes(id) ? f.assignees.filter((x) => x !== id) : [...f.assignees, id] }));
  }

  return (
    <div className="modal-scrim items-start justify-center overflow-y-auto p-4">
      <div className="card my-8 w-full max-w-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">{task.space_name} › {task.list_name}</p>
            {task.recurrence_id ? (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sunk px-2 py-0.5 text-[11px] font-semibold text-ink-3">
                <Repeat size={11} />One day of a repeating task — changes here apply to this day only
              </p>
            ) : null}
            {isAdmin
              ? <input className="input mt-1 text-lg font-bold" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              : <h3 className="mt-1 text-lg font-bold text-ink">{task.title}</h3>}
          </div>
          <button type="button" aria-label="Close" className="rounded-lg p-1.5 text-ink-4 hover:bg-sunk" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {WORK_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={form.priority} disabled={!isAdmin} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {["Urgent", "High", "Normal", "Low"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Due date">
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1" type="date" value={form.due_date} disabled={!isAdmin} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              <input className="input w-28" type="time" aria-label="Due time" value={form.due_time} disabled={!isAdmin} onChange={(e) => setForm({ ...form, due_time: e.target.value })} />
            </div>
          </Field>
          {isAdmin ? (
            <>
              <Field label="Space">
                <select className="input" value={spaceId} onChange={(e) => {
                  const next = Number(e.target.value);
                  setSpaceId(next);
                  setForm({ ...form, list_id: String(lists.find((l) => l.space_id === next)?.id ?? "") });
                }}>
                  {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="List">
                <select className="input" value={form.list_id} onChange={(e) => setForm({ ...form, list_id: e.target.value })}>
                  {modalLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            </>
          ) : null}
        </div>

        <div className="mt-4">
          <p className="label">Description</p>
          {isAdmin
            ? <textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            : <p className="rounded-xl border border-line p-3 text-sm text-ink-2">{task.description || "No description."}</p>}
        </div>

        <div className="mt-4">
          <p className="label">Assignees</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = form.assignees.includes(p.id);
              return (
                <button key={p.id} type="button" disabled={!isAdmin} onClick={() => toggleAssignee(p.id)}
                  className={classNames("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
                    on ? "border-brand bg-orange-50 text-brand" : "border-line bg-white text-ink-3", !isAdmin && "cursor-default")}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700">{initialsOf(p.display_name)}</span>
                  {p.display_name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="label">Comments</p>
          <div className="max-h-52 space-y-3 overflow-y-auto">
            {comments.length ? comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700">{initialsOf(c.author_name)}</span>
                <div>
                  <p className="text-[11px] text-ink-4"><span className="font-semibold text-ink-2">{c.author_name}</span> · {shortTime(c.created_at)}</p>
                  <p className="whitespace-pre-wrap text-sm text-ink">{c.body}</p>
                </div>
              </div>
            )) : <p className="text-sm text-ink-4">No comments yet.</p>}
          </div>
          <form onSubmit={comment} className="mt-3 flex gap-2">
            <input className="input flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment…" />
            <button type="submit" className="btn btn-soft">Post</button>
          </form>
        </div>

        <div className="mt-5 flex justify-between gap-3">
          {isAdmin ? <button type="button" className="btn btn-soft text-rose-600" onClick={remove}><Trash2 size={16} />Delete</button> : <span />}
          <div className="flex gap-3">
            <button type="button" className="btn btn-soft" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type RepeatMode = "none" | "weekly" | "monthly";

// One form for a single task and for a repeating one. With "Repeat" on, the due
// date gives way to a schedule: which days, from when, until when, at what time.
// Passing `series` opens an existing repeating task for editing.
function WorkTaskForm({ spaces, lists, people, initial, series, onClose, onSaved }: {
  spaces: WorkSpace[]; lists: WorkList[]; people: WorkPerson[]; initial: { status: string; listId: string; repeat?: RepeatMode };
  series?: WorkRecurrence;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    list_id: series ? String(series.list_id) : initial.listId,
    title: series?.title ?? "", description: series?.description ?? "",
    priority: series?.priority ?? "Normal", status: initial.status, due_date: "", due_time: series?.due_time ?? "",
    assignees: series?.assignee_ids ?? ([] as number[]),
  });
  const [repeat, setRepeat] = useState<RepeatMode>(series ? series.frequency : initial.repeat ?? "none");
  const [days, setDays] = useState<number[]>(
    series?.days_of_week ? series.days_of_week.split(",").map(Number) : [1, 2, 3, 4, 5, 6],
  );
  const [monthDay, setMonthDay] = useState(series?.month_day ?? Number(today.slice(8, 10)));
  const [startDate, setStartDate] = useState(series?.start_date ?? today);
  const [endDate, setEndDate] = useState(series?.end_date ?? "");
  const [ends, setEnds] = useState<"never" | "on">(series?.end_date ? "on" : "never");
  // Pick the space first, then only its lists are offered.
  const [spaceId, setSpaceId] = useState(
    lists.find((l) => String(l.id) === (series ? String(series.list_id) : initial.listId))?.space_id ?? spaces[0]?.id ?? 0,
  );
  const formLists = lists.filter((l) => l.space_id === spaceId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const repeating = repeat !== "none";
  const sortedDays = WEEK_ORDER.filter((d) => days.includes(d));
  const preview = repeating
    ? describeRepeat({
      frequency: repeat, days_of_week: sortedDays.join(","), month_day: monthDay,
      due_time: form.due_time || null, end_date: ends === "on" && endDate ? endDate : null,
    })
    : "";

  function toggleDay(d: number) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Every task must sit under a brand list.
    if (!form.list_id) { setError("Pick the list this task belongs to."); return; }
    if (repeat === "weekly" && !days.length) { setError("Pick at least one day for it to repeat on."); return; }
    if (repeating && ends === "on" && !endDate) { setError("Pick the date the repeat ends, or choose “Never”."); return; }
    if (repeating && ends === "on" && endDate < startDate) { setError("The end date is before the start date."); return; }
    setBusy(true); setError("");
    try {
      if (repeating) {
        const body = {
          list_id: Number(form.list_id), title: form.title, description: form.description, priority: form.priority,
          assignees: form.assignees, due_time: form.due_time,
          frequency: repeat, days_of_week: sortedDays, month_day: monthDay,
          start_date: startDate, end_date: ends === "on" ? endDate : "",
        };
        await api(series ? `/work/recurrences/${series.id}` : "/work/recurrences", {
          method: series ? "PUT" : "POST", body: JSON.stringify(body),
        });
      } else {
        await api("/work/tasks", { method: "POST", body: JSON.stringify(form) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
    setBusy(false);
  }

  return (
    <div className="modal-scrim items-start justify-center overflow-y-auto p-4">
      <form onSubmit={submit} className="card my-8 w-full max-w-lg space-y-4 p-6">
        <h3 className="text-lg font-bold text-ink">{series ? "Edit repeating task" : "New task"}</h3>
        {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Space">
            <select className="input" value={spaceId} onChange={(e) => {
              const next = Number(e.target.value);
              setSpaceId(next);
              setForm({ ...form, list_id: "" });
            }}>
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="List (required)">
            <select required className="input" value={form.list_id} onChange={(e) => setForm({ ...form, list_id: e.target.value })}>
              <option value="">Select a list…</option>
              {formLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        {!formLists.length ? <p className="text-xs font-semibold text-amber-700">No approved list in this space yet — create one first.</p> : null}
        <Field label="Title"><input required autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={repeating ? "e.g. Daily client report" : "e.g. Design August reels"} /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>

        {/* Repeat: off by default; a series cannot be turned back into one task. */}
        {!series ? (
          <div>
            <p className="label">Repeat</p>
            <div className="flex gap-1 rounded-full bg-sunk p-1">
              {([["none", "Does not repeat"], ["weekly", "Weekly"], ["monthly", "Monthly"]] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setRepeat(value)}
                  className={classNames("flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    repeat === value ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {repeating ? (
          <div className="space-y-3 rounded-xl border border-line bg-sunk/50 p-3">
            {repeat === "weekly" ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-4">On these days</p>
                  <span className="flex gap-1">
                    {([["Mon–Sat", [1, 2, 3, 4, 5, 6]], ["Weekdays", [1, 2, 3, 4, 5]], ["Every day", [0, 1, 2, 3, 4, 5, 6]]] as const).map(([label, set]) => (
                      <button key={label} type="button" onClick={() => setDays([...set])}
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink-3 hover:bg-white hover:text-brand">
                        {label}
                      </button>
                    ))}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {WEEK_ORDER.map((d) => {
                    const on = days.includes(d);
                    return (
                      <button key={d} type="button" aria-pressed={on} aria-label={WEEKDAY_SHORT[d]} title={WEEKDAY_SHORT[d]} onClick={() => toggleDay(d)}
                        className={classNames("flex h-9 flex-1 items-center justify-center rounded-lg border text-xs font-bold transition",
                          on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink-3 hover:border-line-strong")}>
                        {WEEKDAY_LETTER[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Field label="Day of the month">
                <select className="input" value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{ordinal(d)}{d >= 29 ? " (or last day of shorter months)" : ""}</option>
                  ))}
                </select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <input className="input" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="Time (optional)">
                <input className="input" type="time" value={form.due_time} onChange={(e) => setForm({ ...form, due_time: e.target.value })} />
              </Field>
            </div>

            <div>
              <p className="label">Ends</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-2">
                  <input type="radio" name="ends" checked={ends === "never"} onChange={() => setEnds("never")} />Never
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-2">
                  <input type="radio" name="ends" checked={ends === "on"} onChange={() => setEnds("on")} />On a date
                </label>
                {ends === "on" ? (
                  <input className="input h-9 w-auto py-0 text-sm" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                ) : null}
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <Repeat size={12} className="text-brand" />{preview || "Pick the days it repeats on"}
            </p>
            <p className="text-[11px] leading-relaxed text-ink-4">
              Each day becomes its own task, so it can be ticked off on its own. The next week is always on the calendar.
            </p>
          </div>
        ) : null}

        <div className={classNames("grid gap-3", repeating ? "grid-cols-1" : "grid-cols-3")}>
          {!repeating ? (
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {WORK_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label="Priority">
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {["Urgent", "High", "Normal", "Low"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          {!repeating ? (
            <Field label="Due">
              <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </Field>
          ) : null}
        </div>
        {!repeating && form.due_date ? (
          <Field label="Due time (optional)">
            <input className="input w-36" type="time" value={form.due_time} onChange={(e) => setForm({ ...form, due_time: e.target.value })} />
          </Field>
        ) : null}
        <div>
          <p className="label">Assign to</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = form.assignees.includes(p.id);
              return (
                <button key={p.id} type="button"
                  onClick={() => setForm((f) => ({ ...f, assignees: on ? f.assignees.filter((x) => x !== p.id) : [...f.assignees, p.id] }))}
                  className={classNames("rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-brand bg-orange-50 text-brand" : "border-line text-ink-3")}>
                  {p.display_name}
                </button>
              );
            })}
          </div>
        </div>
        {series ? (
          <p className="text-[11px] text-ink-4">Saving rebuilds the upcoming days that nobody has started. Anything already in progress or done stays as it is.</p>
        ) : null}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : series ? "Save changes" : repeating ? "Create repeating task" : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Every repeating task in one place: what it is, when it comes round next, and
// the controls to pause, change or end it.
function RecurringPanel({ isAdmin, spaces, lists, people, onClose, onChanged }: {
  isAdmin: boolean; spaces: WorkSpace[]; lists: WorkList[]; people: WorkPerson[];
  onClose: () => void; onChanged: () => void;
}) {
  const [items, setItems] = useState<WorkRecurrence[] | null>(null);
  const [editing, setEditing] = useState<WorkRecurrence | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState(0);

  async function load() {
    try {
      const d = await api<{ recurrences: WorkRecurrence[] }>("/work/recurrences");
      setItems(d.recurrences);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load repeating tasks"); }
  }
  useEffect(() => {
    load();
    api<{ user: { id: number } }>("/me").then((d) => setMe(d.user.id)).catch(() => undefined);
  }, []);

  const nameOf = (id: number) => people.find((p) => p.id === id)?.display_name ?? "—";
  const canManage = (r: WorkRecurrence) => isAdmin || r.created_by === me;

  async function setActive(r: WorkRecurrence, active: boolean) {
    setError("");
    try {
      await api(`/work/recurrences/${r.id}`, { method: "PUT", body: JSON.stringify({ active }) });
      await load(); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update"); }
  }

  async function end(r: WorkRecurrence) {
    if (!window.confirm(`Stop repeating “${r.title}”?\n\nUpcoming days nobody has started are removed. Past, in-progress and finished ones stay as normal tasks.`)) return;
    setError("");
    try {
      await api(`/work/recurrences/${r.id}`, { method: "DELETE" });
      await load(); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not end it"); }
  }

  if (editing || creating) {
    return (
      <WorkTaskForm spaces={spaces} lists={lists} people={people} series={editing ?? undefined}
        initial={{ status: "To Do", listId: "", repeat: "weekly" }}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={async () => { setEditing(null); setCreating(false); await load(); onChanged(); }} />
    );
  }

  return (
    <div className="modal-scrim items-start justify-center overflow-y-auto p-4">
      <div className="card my-8 w-full max-w-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-ink">Repeating tasks</h3>
            <p className="mt-0.5 text-xs text-ink-3">Work that comes round on a schedule. Each day it is due appears on the board as its own task.</p>
          </div>
          <button type="button" aria-label="Close" className="rounded-lg p-1.5 text-ink-4 hover:bg-sunk" onClick={onClose}><X size={20} /></button>
        </div>
        {error ? <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div> : null}

        <div className="mt-4 space-y-2">
          {items === null ? <p className="py-8 text-center text-sm text-ink-4">Loading…</p> : null}
          {items && !items.length ? (
            <div className="rounded-xl border border-dashed border-line py-10 text-center">
              <Repeat size={20} className="mx-auto text-ink-4" />
              <p className="mt-2 text-sm font-semibold text-ink-2">No repeating tasks yet</p>
              <p className="mt-0.5 text-xs text-ink-4">For things like a daily report, Mon–Sat at 10:00.</p>
            </div>
          ) : null}
          {items?.map((r) => (
            <div key={r.id} className={classNames("rounded-xl border border-line p-3", r.active ? "bg-white" : "bg-sunk/60")}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityTag priority={r.priority} compact />
                    <p className={classNames("font-semibold", r.active ? "text-ink" : "text-ink-3")}>{r.title}</p>
                    {!r.active ? <span className="badge bg-amber-100 text-amber-700">Paused</span> : null}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                    <Repeat size={12} className="text-brand" />{describeRepeat(r)}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-4">
                    {r.space_name} › {r.list_name}
                    {r.assignee_ids.length ? ` · ${r.assignee_ids.map(nameOf).join(", ")}` : ""}
                    {r.active && r.next_date ? ` · next ${r.next_date === today ? "today" : prettyDate(r.next_date)}` : ""}
                    {r.made_count ? ` · ${r.done_count} of ${r.made_count} done` : ""}
                  </p>
                </div>
                {canManage(r) ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setActive(r, !r.active)}
                      title={r.active ? "Pause: stops new days and removes upcoming ones nobody has started" : "Resume from today"}>
                      {r.active ? <><Pause size={13} />Pause</> : <><Play size={13} />Resume</>}
                    </button>
                    <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(r)}><Pencil size={13} />Edit</button>
                    <button type="button" className="btn btn-ghost px-2 py-1 text-xs text-rose-600" onClick={() => end(r)}><Trash2 size={13} />End</button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-between gap-3">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} />New repeating task</button>
          <button type="button" className="btn btn-soft" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Anyone can propose a space; an admin's goes live at once, everyone else's waits.
function NewSpaceForm({ isAdmin, onClose, onSaved }: { isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/work/spaces", { method: "POST", body: JSON.stringify({ name }) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create space");
    }
    setBusy(false);
  }

  return (
    <div className="modal-scrim items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6">
        <h3 className="text-lg font-bold text-ink">{isAdmin ? "New space" : "Request a space"}</h3>
        <p className="text-xs text-ink-3">
          {isAdmin ? "Spaces group your brand lists — e.g. Clients, Internal." : "Your request goes to the admin for approval."}
        </p>
        {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div> : null}
        <Field label="Space name"><input required autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Clients" /></Field>
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : isAdmin ? "Create" : "Send request"}</button>
        </div>
      </form>
    </div>
  );
}

// Lists are the brands you work with, and they always live inside a space.
function NewListForm({ isAdmin, spaces, initialSpaceId, onClose, onSaved }: {
  isAdmin: boolean; spaces: WorkSpace[]; initialSpaceId: number; onClose: () => void; onSaved: () => void;
}) {
  const [spaceId, setSpaceId] = useState(String(initialSpaceId || spaces[0]?.id || ""));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/work/lists", { method: "POST", body: JSON.stringify({ space_id: Number(spaceId), name }) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create list");
    }
    setBusy(false);
  }

  return (
    <div className="modal-scrim items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6">
        <h3 className="text-lg font-bold text-ink">{isAdmin ? "New list" : "Request a list"}</h3>
        <p className="text-xs text-ink-3">
          {isAdmin ? "One list per brand you work with." : "Your request goes to the admin for approval."}
        </p>
        {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div> : null}
        <Field label="Space">
          <select required className="input" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        {!spaces.length ? <p className="text-xs font-semibold text-amber-700">No approved space yet — create a space first.</p> : null}
        <Field label="Brand / list name"><input required autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Heaven Solar" /></Field>
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !spaces.length}>{busy ? "Saving…" : isAdmin ? "Create" : "Send request"}</button>
        </div>
      </form>
    </div>
  );
}

type LeaveBalance = { id: number; name: string; is_paid: number; yearly_balance: number; used: number };

function leaveDates(row: LeaveRequest) {
  return row.start_date === row.end_date ? prettyDate(row.start_date) : `${prettyDate(row.start_date)} → ${prettyDate(row.end_date)}`;
}

function Leave({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [form, setForm] = useState({ leave_type_id: "", start_date: today, end_date: today, reason: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const q = isAdmin && employeeId ? `?employeeId=${employeeId}` : "";
    const data = await api<{ leaves: LeaveRequest[]; leaveTypes: LeaveType[]; employees?: Employee[]; balances?: LeaveBalance[] }>(`/leaves${q}`);
    setRows(data.leaves);
    setLeaveTypes(data.leaveTypes);
    if (data.employees) setEmployees(data.employees);
    if (data.balances) setBalances(data.balances);
    setForm((f) => (f.leave_type_id ? f : { ...f, leave_type_id: String(data.leaveTypes[0]?.id ?? "") }));
  }

  useEffect(() => { load().catch((err) => setMessage(err.message)); }, [employeeId]);

  async function apply(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      await api("/leaves", { method: "POST", body: JSON.stringify(form) });
      setForm({ ...form, start_date: today, end_date: today, reason: "" });
      setMessage("Sent to your admin for approval.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not apply");
    }
    setBusy(false);
  }

  async function decide(id: number, status: "Approved" | "Rejected") {
    const admin_note = status === "Rejected" ? (window.prompt("Reason for rejecting (optional)") ?? "") : "";
    await api(`/leaves/${id}/decision`, { method: "POST", body: JSON.stringify({ status, admin_note }) });
    await load();
  }

  const pending = rows.filter((r) => r.status === "Pending");
  const settled = rows.filter((r) => r.status !== "Pending");
  const days = form.start_date && form.end_date && form.end_date >= form.start_date
    ? Math.round((Date.parse(form.end_date) - Date.parse(form.start_date)) / 86400000) + 1 : 0;

  const list = (items: LeaveRequest[], actions: boolean) => (
    <div className="card divide-y divide-line">
      {items.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">
              {isAdmin ? `${row.employee_name} · ` : ""}{row.leave_type_name}
              <span className="ml-2 text-[12.5px] font-normal text-ink-3">{row.days} day{row.days === 1 ? "" : "s"}</span>
            </p>
            <p className="text-[12.5px] text-ink-3">
              {leaveDates(row)}{row.reason ? ` · ${row.reason}` : ""}{row.admin_note ? ` · Admin: ${row.admin_note}` : ""}
            </p>
          </div>
          {actions ? (
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary py-1.5" onClick={() => decide(row.id, "Approved")}>Approve</button>
              <button type="button" className="btn btn-soft py-1.5 text-rose-600" onClick={() => decide(row.id, "Rejected")}>Reject</button>
            </div>
          ) : <Badge value={row.status} />}
        </div>
      ))}
    </div>
  );

  return (
    <section className="space-y-5">
      <PageTitle title="Leave" description={isAdmin ? "Approve requests. Approved leave flows into attendance and salary by itself." : "Apply for time off and see where your requests stand."} />
      {message ? <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm font-semibold text-ink-2">{message}</div> : null}

      {!isAdmin ? (
        <>
          {balances.some((b) => b.is_paid) ? (
            <div className="flex flex-wrap gap-3">
              {balances.filter((b) => b.is_paid).map((b) => (
                <div key={b.id} className="card min-w-[10rem] flex-1 p-4">
                  <p className="text-[12.5px] text-ink-3">{b.name}</p>
                  <p className="tnum mt-1 text-[22px] font-bold leading-none text-ink">
                    {Math.max(0, Number(b.yearly_balance) - Number(b.used))}
                    <span className="ml-1 text-[12.5px] font-medium text-ink-3">of {b.yearly_balance} left this year</span>
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <form onSubmit={apply} className="card space-y-4 p-5">
            <p className="text-[15px] font-semibold text-ink">Apply for leave</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Type">
                <select className="input" value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
                  {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}{type.is_paid ? "" : " (unpaid)"}</option>)}
                </select>
              </Field>
              <Field label="From"><input required className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: e.target.value > form.end_date ? e.target.value : form.end_date })} /></Field>
              <Field label="To"><input required className="input" type="date" min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
            </div>
            <Field label="Reason"><input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional" /></Field>
            <div className="flex items-center justify-end gap-3">
              {days ? <span className="text-[12.5px] text-ink-3">{days} day{days === 1 ? "" : "s"}</span> : null}
              <button className="btn btn-primary" disabled={busy || !days}>{busy ? "Sending…" : "Apply"}</button>
            </div>
          </form>
        </>
      ) : null}

      {isAdmin && pending.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">Waiting for you · {pending.length}</p>
          {list(pending, true)}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">{isAdmin ? "All leave" : "My requests"}</p>
          {isAdmin ? <div className="ml-auto"><PersonPicker value={employeeId} onChange={setEmployeeId} people={employees} /></div> : null}
        </div>
        {(isAdmin ? settled : rows).length
          ? list(isAdmin ? settled : rows, false)
          : <EmptyState title={isAdmin ? "No leave taken yet." : "You haven't applied for leave yet."} />}
      </div>
    </section>
  );
}

// Shrinks a payment screenshot to something a database row can carry.
async function shrinkProof(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

function Payroll({ isAdmin }: { isAdmin: boolean }) {
  const now = new Date();
  // Salary is worked out for finished months only, so the newest is last month.
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [month, setMonth] = useState(last.getMonth() + 1);
  const [year, setYear] = useState(last.getFullYear());
  const [rows, setRows] = useState<Salary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [paying, setPaying] = useState<Salary | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    api<{ employees: Employee[] }>("/employees").then((d) => setEmployees(d.employees)).catch(() => undefined);
  }, [isAdmin]);

  async function load() {
    // Admins look at one month across people; an employee sees their own year.
    const params = isAdmin
      ? new URLSearchParams({ period: "Custom", month: String(month), year: String(year), ...(employeeId ? { employeeId } : {}) })
      : new URLSearchParams({ period: "Last 12 Months" });
    const data = await api<{ salaries: Salary[] }>(`/payroll?${params.toString()}`);
    setRows(data.salaries);
    setLoaded(true);
  }

  useEffect(() => { setOpenId(null); load().catch((err) => setMessage(err.message)); }, [month, year, employeeId]);

  async function prepare() {
    setBusy(true); setMessage("");
    try {
      await api("/payroll/generate", { method: "POST", body: JSON.stringify({ month, year }) });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not prepare salaries");
    }
    setBusy(false);
  }

  async function markPaid(e: FormEvent) {
    e.preventDefault();
    if (!paying) return;
    setBusy(true);
    try {
      const payment_proof = proof ? await shrinkProof(proof) : undefined;
      await api(`/payroll/${paying.id}`, { method: "PUT", body: JSON.stringify({ status: "Paid", ...(payment_proof ? { payment_proof } : {}) }) });
      setPaying(null); setProof(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not mark paid");
    }
    setBusy(false);
  }

  async function markUnpaid(row: Salary) {
    if (!window.confirm(`Mark ${row.employee_name}'s salary as not paid?`)) return;
    await api(`/payroll/${row.id}`, { method: "PUT", body: JSON.stringify({ status: "Unpaid" }) });
    await load();
  }

  const total = rows.reduce((n, r) => n + (Number(r.net_salary) || 0), 0);
  const paid = rows.filter((r) => r.status === "Done").reduce((n, r) => n + (Number(r.net_salary) || 0), 0);

  return (
    <section className="space-y-5">
      <PageTitle
        title={isAdmin ? "Payroll" : "Payslips"}
        description={isAdmin
          ? "Salary is worked out from attendance and leave. Check it, pay it, mark it paid."
          : "Your salary for each month. Click a month to see how it was worked out."}
      />
      {message ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{message}</div> : null}

      {isAdmin ? (
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <MonthStepper month={month} year={year} max={{ month: last.getMonth() + 1, year: last.getFullYear() }}
            onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <PersonPicker value={employeeId} onChange={setEmployeeId} people={employees} />
          {rows.length ? (
            <p className="tnum ml-auto text-[12.5px] text-ink-3">
              <span className="font-semibold text-ink">{currency.format(total - paid)}</span> to pay · {currency.format(paid)} paid · {currency.format(total)} total
            </p>
          ) : null}
        </div>
      ) : null}

      {loaded && !rows.length ? (
        <EmptyState
          title={isAdmin ? `Salaries for ${monthNames[month - 1]} ${year} aren't prepared yet.` : "No payslips yet."}
          action={isAdmin && !employeeId ? <button type="button" className="btn btn-primary" disabled={busy} onClick={prepare}><Banknote size={16} />{busy ? "Preparing…" : "Prepare salaries"}</button> : undefined}
        />
      ) : null}

      {rows.length ? (
        <div className="card divide-y divide-line">
          {rows.map((row) => {
            const open = openId === row.id;
            return (
              <div key={row.id}>
                <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenId(open ? null : row.id)}>
                    <ChevronRight size={16} className={classNames("shrink-0 text-ink-4 transition-transform duration-150", open && "rotate-90")} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-ink">
                        {isAdmin ? row.employee_name : `${monthNames[row.salary_month - 1]} ${row.salary_year}`}
                      </span>
                      <span className="tnum block text-[12.5px] text-ink-3">
                        {row.paid_days} of {row.working_days} days paid
                        {row.deductions > 0 ? ` · −${currency.format(row.deductions)}` : ""}
                      </span>
                    </span>
                  </button>
                  <span className="tnum text-[15px] font-bold text-ink">{currency.format(row.net_salary)}</span>
                  <Badge value={row.status === "Done" ? "Paid" : "Not paid"} />
                  <div className="flex gap-1.5">
                    <a className="btn btn-ghost px-2.5 py-1.5 text-xs" href={`/api/salary-slips/${row.id}`} target="_blank" rel="noreferrer"><Download size={14} />Payslip</a>
                    {row.payment_proof ? (
                      <a className="btn btn-ghost px-2.5 py-1.5 text-xs" href={row.payment_proof} download={`payment_${row.employee_name}_${row.salary_month}.jpg`}><ImageIcon size={14} />Proof</a>
                    ) : null}
                    {isAdmin ? (row.status !== "Done"
                      ? <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" onClick={() => setPaying(row)}>Mark paid</button>
                      : <button type="button" className="btn btn-ghost px-2.5 py-1.5 text-xs text-ink-3" onClick={() => markUnpaid(row)}>Undo</button>) : null}
                  </div>
                </div>
                {open ? (
                  <div className="border-t border-line bg-[var(--surface-sunk)] p-3">
                    <MonthGrid isAdmin={isAdmin} showSalary month={row.salary_month} year={row.salary_year}
                      employeeId={isAdmin ? String(row.employee_id) : undefined} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {paying ? (
        <div className="modal-scrim items-center justify-center p-4">
          <form onSubmit={markPaid} className="card w-full max-w-md space-y-4 p-6">
            <h3 className="text-lg font-bold text-ink">Mark {paying.employee_name}'s salary paid</h3>
            <p className="tnum text-sm text-ink-3">{currency.format(paying.net_salary)} for {monthNames[paying.salary_month - 1]} {paying.salary_year}. They'll be notified and can download the payslip.</p>
            <Field label="Payment screenshot (optional)">
              <input type="file" accept="image/*" className="input" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
            </Field>
            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-soft" onClick={() => { setPaying(null); setProof(null); }}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Mark paid"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function Holidays({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Holiday[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const data = await api<{ holidays: Holiday[] }>("/holidays");
    setRows(data.holidays);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      await api("/holidays", { method: "POST", body: JSON.stringify(body) });
      form.reset();
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save holiday");
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this holiday?")) return;
    await api(`/holidays/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="space-y-4">
      {message ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">{message}</div> : null}
      {isAdmin ? (
        <form onSubmit={save} className="card grid gap-3 p-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
          <Field label="Holiday name"><input required name="name" className="input" placeholder="Holiday name" /></Field>
          <Field label="Date"><input required name="holiday_date" className="input" type="date" defaultValue={today} /></Field>
          <Field label="Description"><input name="description" className="input" placeholder="Optional note" /></Field>
          <button className="btn btn-primary self-end"><Plus size={17} />Add</button>
        </form>
      ) : null}
      <DataTable
        title="Holidays"
        rows={[...rows].sort((a, b) => b.holiday_date.localeCompare(a.holiday_date))}
        columns={[
          ["Holiday", (row) => <span className="font-semibold text-ink">{row.name}</span>],
          ["Date", (row) => row.holiday_date],
          ["Description", (row) => row.description || "-"],
          ["Action", (row) => isAdmin ? <button className="btn btn-soft" onClick={() => remove(row.id)}>Delete</button> : "-"],
        ]}
      />
    </section>
  );
}

// ─── Charts ────────────────────────────────────────────────────────────────
// Hand-drawn SVG rather than a charting library: a few hundred bytes instead
// of ~100KB, and full control over the marks.
//
// Colour is assigned by the job it does. Attendance states use the reserved
// status palette; everything else is a single hue, because identity is carried
// by the axis label and a second colour would only be decoration.
//
// The validator flagged status-warning (#fab219) against status-serious
// (#ec835a) at ΔE 13.6, under the 15 floor for normal vision. So no chart here
// ever asks the reader to tell two status colours apart: every status is its
// own directly-labelled row, and the same numbers are in the table below.


function ChartFrame({ title, hint, children, empty }: {
  title: string; hint?: string; children: React.ReactNode; empty?: boolean;
}) {
  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-ink">{title}</h3>
        {hint ? <p className="mt-0.5 text-[11.5px] text-ink-3">{hint}</p> : null}
      </div>
      {empty ? <p className="py-10 text-center text-[13px] text-ink-3">Nothing in this range.</p> : children}
    </div>
  );
}

// Horizontal bars, one labelled row each. The label carries identity, so the
// colour never has to.
function BarRows({ rows, tone }: { rows: Array<{ label: string; value: number; colour?: string }>; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="group flex items-center gap-3" title={`${r.label}: ${r.value}`}>
          <span className="w-[86px] shrink-0 truncate text-[12px] text-ink-2">{r.label}</span>
          <div className="relative h-[18px] flex-1 overflow-hidden rounded-[4px]" style={{ background: "var(--surface-sunk)" }}>
            <div
              className="h-full rounded-[4px] transition-[width] duration-500 ease-premium"
              style={{ width: `${Math.max(r.value ? 3 : 0, (r.value / max) * 100)}%`, background: r.colour ?? tone ?? VIZ.single }}
            />
          </div>
          <span className="tnum w-9 shrink-0 text-right text-[12px] font-semibold text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// One series over time. 2px line, 8px markers on hover, recessive grid.
function TrendLine({ points, suffix = "" }: { points: Array<{ label: string; value: number }>; suffix?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 560, h = 150, padX = 8, padY = 12;
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0;
  const xy = (i: number, v: number) => [padX + i * stepX, h - padY - (v / max) * (h - padY * 2)] as const;
  const line = points.map((p, i) => { const [x, y] = xy(i, p.value); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const area = `${line} L${(padX + (points.length - 1) * stepX).toFixed(1)},${h - padY} L${padX},${h - padY} Z`;
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 150 }} role="img" aria-label="Trend over the selected range">
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={padX} x2={w - padX} y1={padY + t * (h - padY * 2)} y2={padY + t * (h - padY * 2)} stroke="var(--line)" strokeWidth="1" />
        ))}
        <path d={area} fill={VIZ.single} opacity="0.08" />
        <path d={line} fill="none" stroke={VIZ.single} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          const [x, y] = xy(i, p.value);
          return (
            <g key={p.label}>
              {hover === i ? <circle cx={x} cy={y} r="4.5" fill={VIZ.single} stroke="#fff" strokeWidth="2" /> : null}
              <rect x={x - stepX / 2} y={0} width={Math.max(stepX, 10)} height={h} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10.5px] text-ink-3">
        <span>{points[0]?.label}</span>
        <span className="tnum font-semibold text-ink-2">
          {active ? `${active.label} · ${active.value}${suffix}` : `peak ${max}${suffix}`}
        </span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

type ReportSummary = {
  range: { start: string; end: string };
  headcount: number;
  attendanceByStatus: Array<{ status: string; count: number }>;
  daily: Array<{ day: string; present: number; late: number; marked: number }>;
  byEmployee: Array<{ name: string; code: string; present: number; late: number; half: number; absent: number; leave_days: number; marked: number }>;
  leaveByType: Array<{ type: string | null; requests: number; days: number }>;
  payroll: Array<{ year: number; month: number; gross: number; deductions: number; net: number; paid: number }>;
  tasksByStatus: Array<{ status: string; count: number }>;
};

const RANGE_PRESETS: Array<{ id: string; label: string; of: () => [string, string] }> = [
  { id: "this-month", label: "This month", of: () => [today.slice(0, 8) + "01", today] },
  { id: "last-month", label: "Last month", of: () => {
      const d = new Date(); const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
      const m = d.getMonth() === 0 ? 12 : d.getMonth();
      const last = new Date(y, m, 0).getDate();
      const mm = String(m).padStart(2, "0");
      return [`${y}-${mm}-01`, `${y}-${mm}-${String(last).padStart(2, "0")}`];
    } },
  { id: "quarter", label: "Last 90 days", of: () => [new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10), today] },
  { id: "year", label: "This year", of: () => [`${new Date().getFullYear()}-01-01`, today] },
];

function Reports() {
  const [meta, setMeta] = useState<{ employees: Employee[]; departments: Department[] }>({ employees: [], departments: [] });
  const [preset, setPreset] = useState("this-month");
  const [filters, setFilters] = useState({ employeeId: "", departmentId: "", start: today.slice(0, 8) + "01", end: today });
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ employees: Employee[]; departments: Department[] }>("/reports/meta").then(setMeta).catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const q = new URLSearchParams({ start: filters.start, end: filters.end, employeeId: filters.employeeId, departmentId: filters.departmentId });
    api<ReportSummary>(`/reports/summary?${q.toString()}`)
      .then((d) => { if (alive) { setData(d); setError(""); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not build the report"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filters.start, filters.end, filters.employeeId, filters.departmentId]);

  function applyPreset(id: string) {
    const found = RANGE_PRESETS.find((p) => p.id === id);
    setPreset(id);
    if (found) { const [start, end] = found.of(); setFilters((f) => ({ ...f, start, end })); }
  }

  const statusRows = ["Present", "Late", "Half Day", "Absent", "On Leave"].map((status) => ({
    label: status,
    value: Number(data?.attendanceByStatus.find((r) => r.status === status)?.count ?? 0),
    colour: STATUS_COLOUR[status],
  }));

  const marked = statusRows.reduce((n, r) => n + r.value, 0);
  const attended = statusRows.filter((r) => r.label === "Present" || r.label === "Late").reduce((n, r) => n + r.value, 0);
  const attendanceRate = marked ? Math.round((attended / marked) * 100) : 0;
  const payrollTotal = (data?.payroll ?? []).reduce((n, p) => n + Number(p.net || 0), 0);
  const payrollOutstanding = (data?.payroll ?? []).reduce((n, p) => n + (Number(p.net || 0) - Number(p.paid || 0)), 0);
  const leaveDays = (data?.leaveByType ?? []).reduce((n, l) => n + Number(l.days || 0), 0);

  const scopeLabel = [
    meta.employees.find((e) => String(e.id) === filters.employeeId)?.full_name,
    meta.departments.find((d) => String(d.id) === filters.departmentId)?.name,
  ].filter(Boolean).join(" · ") || "All employees";

  return (
    <section className="space-y-5">
      {/* Hidden on paper: the printed sheet gets its own heading below, with the
          period and scope spelled out. */}
      <div className="no-print">
        <PageTitle
          title="Reports"
          description="Attendance, leave, payroll and workload across any period."
          action={
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                <FileText size={15} />Download PDF
              </button>
            </div>
          }
        />
      </div>

      {/* Filters sit in one row above the charts. */}
      <div className="card no-print space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => applyPreset(p.id)}
              className={classNames(
                "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors duration-150",
                preset === p.id ? "border-brand bg-brand-tint text-brand" : "border-line bg-white text-ink-2 hover:border-line-strong",
              )}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From">
            <input className="input" type="date" value={filters.start}
              onChange={(e) => { setPreset("custom"); setFilters({ ...filters, start: e.target.value }); }} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={filters.end}
              onChange={(e) => { setPreset("custom"); setFilters({ ...filters, end: e.target.value }); }} />
          </Field>
          <Field label="Employee">
            <PersonPicker value={filters.employeeId} onChange={(id) => setFilters({ ...filters, employeeId: id })} people={meta.employees} allLabel="All employees" />
          </Field>
          <Field label="Department">
            <select className="input" value={filters.departmentId} onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}>
              <option value="">All departments</option>
              {meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      {/* The printed page needs its own heading, since the chrome is hidden. */}
      <div className="print-only mb-4">
        <h1 className="text-xl font-bold text-ink">Fastex HRMS — Report</h1>
        <p className="text-[12px] text-ink-2">{scopeLabel} · {filters.start} to {filters.end}</p>
      </div>

      {loading && !data ? (
        <div className="card p-10 text-center text-[13px] text-ink-3">Building report…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={CalendarCheck} label="Attendance rate" value={`${attendanceRate}%`} sub={`${attended} of ${marked} marked days`} />
            <StatCard icon={UsersRound} label="Headcount" value={data?.headcount ?? 0} sub={scopeLabel} />
            <StatCard icon={FileText} label="Leave days" value={leaveDays} sub={`${(data?.leaveByType ?? []).reduce((n, l) => n + Number(l.requests || 0), 0)} approved requests`} />
            <StatCard icon={Banknote} label="Payroll outstanding" value={currency.format(payrollOutstanding)} sub={`of ${currency.format(payrollTotal)} across ${(data?.payroll ?? []).length} month(s)`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartFrame title="Attendance mix" hint="Marked days in the selected range" empty={!marked}>
              <BarRows rows={statusRows} />
            </ChartFrame>

            <ChartFrame title="Daily attendance" hint="People present each day" empty={!(data?.daily ?? []).length}>
              <TrendLine points={(data?.daily ?? []).map((d) => ({ label: d.day.slice(5), value: Number(d.present) }))} />
            </ChartFrame>

            <ChartFrame title="Leave by type" hint="Approved days overlapping the range" empty={!(data?.leaveByType ?? []).length}>
              <BarRows rows={(data?.leaveByType ?? []).map((l) => ({ label: l.type ?? "Other", value: Number(l.days) }))} />
            </ChartFrame>

            <ChartFrame title="Workload" hint="Every task by stage" empty={!(data?.tasksByStatus ?? []).length}>
              <BarRows rows={WORK_STATUSES.map((st) => ({
                label: st,
                value: Number((data?.tasksByStatus ?? []).find((t) => t.status === st)?.count ?? 0),
              }))} />
            </ChartFrame>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--line)" }}>
              <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Attendance by employee</h3>
              <p className="mt-0.5 text-[11.5px] text-ink-3">The same numbers as the charts above, for anyone who would rather read them.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="table-header">
                  <tr>
                    {["Employee", "Present", "Late", "Half day", "Absent", "Leave", "Rate"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-5 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--line)" }}>
                  {(data?.byEmployee ?? []).length ? (data?.byEmployee ?? []).map((r) => {
                    const total = Number(r.marked) || 0;
                    const ok = Number(r.present) + Number(r.late);
                    return (
                      <tr key={r.code ?? r.name} className="bg-white">
                        <td className="px-5 py-3">
                          <span className="font-semibold text-ink">{r.name}</span>
                          <span className="code ml-2 text-[11px] text-ink-3">{r.code}</span>
                        </td>
                        <td className="tnum px-5 py-3 text-ink-2">{r.present}</td>
                        <td className="tnum px-5 py-3 text-ink-2">{r.late}</td>
                        <td className="tnum px-5 py-3 text-ink-2">{r.half}</td>
                        <td className="tnum px-5 py-3 text-ink-2">{r.absent}</td>
                        <td className="tnum px-5 py-3 text-ink-2">{r.leave_days}</td>
                        <td className="tnum px-5 py-3 font-semibold text-ink">{total ? Math.round((ok / total) * 100) : 0}%</td>
                      </tr>
                    );
                  }) : (
                    <tr><td className="px-5 py-12 text-center text-[13.5px] text-ink-3" colSpan={7}>No attendance in this range.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {(data?.payroll ?? []).length ? (
            <ChartFrame title="Payroll by month" hint="Net payable, most recent months">
              <BarRows rows={(data?.payroll ?? []).map((p) => ({
                label: `${monthNames[p.month - 1]?.slice(0, 3)} ${p.year}`,
                value: Math.round(Number(p.net)),
              }))} />
            </ChartFrame>
          ) : null}
        </>
      )}
    </section>
  );
}


function SettingsPage() {
  const [tab, setTab] = useState<"company" | "holidays" | "leave" | "activity">("company");
  return (
    <section className="space-y-5">
      <PageTitle title="Settings" description="Company rules, holidays and leave types." />
      <Tabs value={tab} onChange={setTab} options={[["company", "Company"], ["holidays", "Holidays"], ["leave", "Leave types"], ["activity", "Activity log"]]} />
      {tab === "company" ? <CompanySettingsForm /> : null}
      {tab === "holidays" ? <Holidays isAdmin /> : null}
      {tab === "leave" ? <LeaveTypes /> : null}
      {tab === "activity" ? <AuditLogs /> : null}
    </section>
  );
}

// Only the rules the system actually uses. Fields it ignores are passed back
// unchanged so saving never resets them.
function CompanySettingsForm() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<{ settings: CompanySettings }>("/settings").then((d) => setSettings(d.settings)).catch((err) => setMessage(err.message));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setMessage("");
    const body = { ...settings, ...Object.fromEntries(new FormData(event.currentTarget).entries()) };
    try {
      const data = await api<{ settings: CompanySettings }>("/settings", { method: "PUT", body: JSON.stringify(body) });
      setSettings(data.settings);
      setMessage("Saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save");
    }
  }

  if (!settings) return <EmptyState title={message || "Loading…"} />;

  return (
    <form onSubmit={save} className="card space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name"><input required name="company_name" className="input" defaultValue={settings.company_name} /></Field>
        <Field label="Address (on payslips)"><input name="company_address" className="input" defaultValue={settings.company_address || ""} /></Field>
      </div>
      <div>
        <p className="text-[13px] font-semibold text-ink">Attendance rules</p>
        <p className="text-[12px] text-ink-3">Sunday is always a paid weekly off. A day without a check-out is counted as leave.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Late after"><input required name="late_mark_time" type="time" className="input" defaultValue={settings.late_mark_time} /></Field>
          <Field label="Full day = hours"><input required name="shift_min_hours" type="number" step="0.5" min="0" className="input" defaultValue={settings.shift_min_hours} /></Field>
          <Field label="Half day = hours"><input required name="half_day_min_hours" type="number" step="0.5" min="0" className="input" defaultValue={settings.half_day_min_hours} /></Field>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        {message ? <span className="text-[12.5px] font-semibold text-ink-3">{message}</span> : null}
        <button className="btn btn-primary">Save</button>
      </div>
    </form>
  );
}

function LeaveTypes() {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [form, setForm] = useState({ name: "", is_paid: "1", yearly_balance: "12" });

  async function load() {
    const data = await api<{ leaveTypes: LeaveType[] }>("/leaves");
    setTypes(data.leaveTypes);
  }
  useEffect(() => { load().catch(console.error); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const yearly = Number(form.yearly_balance) || 0;
    await api("/leave-types", { method: "POST", body: JSON.stringify({ ...form, monthly_balance: Math.round((yearly / 12) * 2) / 2 }) });
    setForm({ name: "", is_paid: "1", yearly_balance: "12" });
    await load();
  }

  async function remove(type: LeaveType) {
    if (!window.confirm(`Remove the leave type "${type.name}"?`)) return;
    try {
      await api(`/leave-types/${type.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not remove");
    }
  }

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-line">
        {types.map((type) => (
          <div key={type.id} className="flex items-center gap-3 px-5 py-3.5">
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-ink">{type.name}</p>
              <p className="text-[12.5px] text-ink-3">{type.is_paid ? `Paid · ${type.yearly_balance} days a year` : "Unpaid — deducted from salary"}</p>
            </div>
            <button type="button" className="btn btn-ghost px-2.5 py-1.5 text-xs text-rose-600" onClick={() => remove(type)}><Trash2 size={13} />Remove</button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <Field label="New leave type"><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sick leave" /></Field>
        <Field label="Paid?">
          <select className="input" value={form.is_paid} onChange={(e) => setForm({ ...form, is_paid: e.target.value })}>
            <option value="1">Paid</option>
            <option value="0">Unpaid</option>
          </select>
        </Field>
        <Field label="Days a year"><input className="input w-28" type="number" min="0" step="0.5" value={form.yearly_balance} disabled={form.is_paid === "0"} onChange={(e) => setForm({ ...form, yearly_balance: e.target.value })} /></Field>
        <button className="btn btn-primary"><Plus size={16} />Add</button>
      </form>
    </div>
  );
}

function AuditLogs() {
  const [rows, setRows] = useState<AuditLog[]>([]);

  useEffect(() => {
    api<{ logs: AuditLog[] }>("/audit-logs")
      .then((data) => setRows(data.logs))
      .catch(console.error);
  }, []);

  return (
    <section>
      <DataTable
        title="Recent admin actions"
        rows={rows}
        columns={[
          ["When", (row) => row.created_at],
          ["Admin", (row) => row.actor_email || "-"],
          ["Action", (row) => <span className="font-semibold text-ink">{row.action}</span>],
          ["Entity", (row) => `${row.entity_type}${row.entity_id ? ` #${row.entity_id}` : ""}`],
          ["Details", (row) => row.details || "-"],
        ]}
      />
    </section>
  );
}

function Profile() {
  const [employee, setEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    api<{ employee: Employee }>("/profile")
      .then((data) => setEmployee(data.employee))
      .catch(console.error);
  }, []);

  if (!employee) return <EmptyState title="Loading profile..." />;

  return (
    <section className="space-y-5">
      <PageTitle title="My Profile" description="Your employee and payroll details." />
      <div className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Employee ID", employee.employee_code],
          ["Name", employee.full_name],
          ["Email", employee.email],
          ["Phone", employee.phone],
          ["Department", employee.department_name],
          ["Designation", employee.designation_name],
          ["Joining date", employee.joining_date],
          ["Monthly salary", currency.format(employee.monthly_salary)],
          ["Bank", employee.bank_name],
          ["Account", employee.account_number],
          ["IFSC", employee.ifsc_code],
          ["Address", employee.address],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="label">{label}</p>
            <p className="mt-1 font-semibold text-ink">{value || "-"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
