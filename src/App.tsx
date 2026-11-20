import {
  Banknote,
  Bell,
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
  Trash2,
  Pencil,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Role = "Superadmin" | "Employee";
type View =
  | "dashboard"
  | "employees"
  | "attendance"
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
  override_type?: "Paid" | "Half Day" | "Unpaid" | null;
  override_reason?: string | null;
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
  adjustment?: number;
  adjustment_note?: string | null;
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
  if (["Done", "Approved", "Present", "Paid by admin"].includes(status)) return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15";
  if (["Pending", "Late", "Half Day", "Half day (admin)"].includes(status)) return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15";
  if (["Rejected", "Absent", "Inactive", "Unpaid (admin)"].includes(status)) return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/15";
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
          <p className="tnum stat mt-1.5 text-[32px] leading-none text-ink">{value}</p>
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

// The FX mark from the Fastex Media brand kit. The F and X take the current
// text colour; the chevron is always Fastex Orange.
function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="138 155 338 306" width={size} height={size * 306 / 338} aria-hidden="true" className="shrink-0">
      <path fill="currentColor" d="M138 241H261.33L290.67 285H138ZM138 330H291.33L262 374H181V461H138Z" />
      <path fill="currentColor" d="M416 155H476L380.5 298.25L350.5 253.25ZM416 461H476L380.5 317.75L350.5 362.75Z" />
      <path fill="#FF6600" d="M204 155H264L366 308L264 461H204L306 308Z" />
    </svg>
  );
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

      <div className="animate-rise relative w-full max-w-[22rem]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="text-ink"><BrandMark size={46} /></span>
          <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.12em] text-ink">Fastex Media</p>
          <h1 className="mt-3 text-[40px] leading-none text-ink">HRMS</h1>
          <p className="mt-3 text-[14px] text-ink-3">Sign in to your workspace</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
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

        <p className="mt-6 text-center text-[11.5px] text-ink-4">© {new Date().getFullYear()} Fastex Media · Engineered for B2B scale.</p>
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
      )} style={{ background: "var(--rail)", borderRight: "1px solid var(--rail-edge)" }}>
        <div className={classNames("flex items-center gap-2.5 px-1.5 pb-5", !navOpen && "justify-center px-0")}>
          <span className="text-ink"><BrandMark size={26} /></span>
          {navOpen ? (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink">Fastex Media</span>
              <span className="block text-[10.5px] font-medium uppercase tracking-[0.12em] text-[var(--rail-text)]">HRMS</span>
            </span>
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
                  active ? "font-semibold text-ink" : "font-medium text-[var(--rail-text)] hover:text-ink",
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
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-ink">
              {initialsOf(user.displayName ?? user.employeeName ?? user.email)}
            </span>
            {navOpen ? (
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[12.5px] font-semibold text-ink">{user.displayName ?? user.employeeName ?? user.email}</span>
                <span className="block truncate text-[10.5px] text-[var(--rail-text)]">{user.role}</span>
              </span>
            ) : null}
            {navOpen ? (
              <button type="button" onClick={onLogout} title="Logout"
                className="shrink-0 rounded-md p-1.5 text-[var(--rail-text)] transition-colors duration-150 hover:bg-[var(--rail-hover)] hover:text-ink">
                <LogOut size={15} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setNavOpen((open) => !open)}
            title={navOpen ? "Collapse menu" : "Expand menu"}
            className={classNames(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--rail-text)] transition-colors duration-150 hover:bg-[var(--rail-hover)] hover:text-ink",
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
          <div className="flex flex-wrap items-center justify-center gap-3 bg-brand-tint px-4 py-2 text-sm font-medium text-ink">
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
          <p className="eyebrow">Today</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ["In", summary.presentToday, "text-emerald-600"],
              ["Not in yet", notIn, "text-ink"],
              ["On leave", summary.onLeaveToday ?? 0, "text-ink-3"],
            ].map(([label, value, tone]) => (
              <div key={label as string}>
                <p className={classNames("tnum stat text-[36px] leading-none", tone as string)}>{value}</p>
                <p className="mt-1.5 text-[12.5px] text-ink-3">{label}</p>
              </div>
            ))}
          </div>
          <button type="button" className="mt-4 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => onView("attendance")}>
            Open attendance →
          </button>
        </div>

        {/* Money still to go out. */}
        <div className="card p-5">
          <p className="eyebrow">Salary to pay · {summary.lastMonthLabel ?? "last month"}</p>
          <p className="tnum stat mt-2 text-[36px] leading-none text-ink">{currency.format(summary.lastMonthOutstanding ?? 0)}</p>
          <p className="mt-1.5 text-[12.5px] text-ink-3">
            {summary.lastMonthPaid ? `${currency.format(summary.lastMonthPaid)} of ${currency.format(summary.lastMonthPayable ?? 0)} already paid` : "Nothing paid yet for this month"}
          </p>
          <button type="button" className="mt-4 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => onView("payroll")}>
            Open payroll →
          </button>
        </div>
      </div>

      <div>
        <div className="card p-2">
          <p className="px-3 pb-1 pt-2 eyebrow">Needs you</p>
          {todo.length ? todo.map((t) => (
            <ActionRow key={t.label} count={t.count} label={t.label} tone={t.tone} onClick={() => onView(t.view)} />
          )) : <p className="px-3 pb-4 pt-2 text-[13.5px] text-ink-3">Nothing waiting. All caught up.</p>}
        </div>

      </div>
    </section>
  );
}

// One line a day for the team, about doing good work. Thirty-one of them, so a
// month goes by without a repeat; the day of the year picks which one shows.
const QUOTES = [
  "Do the small things well and the big things follow.",
  "Progress today beats perfection tomorrow.",
  "Your effort today is someone's reason to trust you tomorrow.",
  "Focus on one thing at a time — that's where good work hides.",
  "Consistency turns ordinary days into a strong career.",
  "Ask the question. Clarity is faster than guessing.",
  "Finish what you start — momentum is built, not found.",
  "A calm hour of focus beats a busy day of noise.",
  "Take the break. Rested minds do better work.",
  "Being reliable is a skill. Practise it daily.",
  "Learn one new thing today — it compounds.",
  "Good teammates make good teams. Be one.",
  "Done and shared beats perfect and hidden.",
  "Celebrate the small wins; they add up by month-end.",
  "Start with the hardest task while your mind is fresh.",
  "Show up on time. It is the easiest promise to keep.",
  "Every expert was once a beginner who kept going.",
  "Write it down. A clear note saves an hour later.",
  "Good work speaks, but a short update helps it be heard.",
  "Mistakes are fine. Hiding them is not.",
  "Small steps every day beat big plans someday.",
  "Make it work, then make it better.",
  "Your attitude decides how the day feels.",
  "Help someone today; it comes back in ways you won't expect.",
  "Be the person others can count on when it matters.",
  "Energy is contagious. Bring good energy in.",
  "One focused task finished beats five half started.",
  "Ask for feedback early, not after it's too late.",
  "Today's discipline is tomorrow's freedom.",
  "Do it right the first time and you won't do it twice.",
  "End the day knowing you gave it your honest best.",
];

function EmployeeDashboard({ onView }: { onView: (view: View) => void }) {
  const quote = useMemo(() => {
    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
    return QUOTES[dayOfYear % QUOTES.length];
  }, []);
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

      {/* Today's thought: Newsreader, with Fastex Orange as a thin accent only. */}
      <div className="card border-l-[3px] p-5" style={{ borderLeftColor: "var(--brand)" }}>
        <p className="eyebrow !text-ember">Today's thought</p>
        <p className="mt-2 font-serif text-[22px] leading-snug text-ink">“{quote}”</p>
      </div>
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
            <p className="eyebrow">Today</p>
            <p className="stat mt-2 text-[32px] leading-none text-ink">
              {isSunday ? "Weekly off" : !checkedIn ? "Not checked in" : checkedOut ? "Day done" : onBreak ? "On a break" : "Working"}
            </p>
            {checkedIn ? (
              <p className="tnum mt-2 text-[13px] text-ink-3">
                In {att?.check_in?.slice(0, 5)}{checkedOut ? ` · Out ${att?.check_out?.slice(0, 5)}` : ""}
              </p>
            ) : null}
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
          <p className="eyebrow">This month</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ["Present", summary.monthAttendance.present + summary.monthAttendance.late],
              ["Late", summary.monthAttendance.late],
              ["Leave", summary.monthAttendance.leave ?? 0],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="tnum stat text-[28px] leading-none text-ink">{value}</p>
                <p className="mt-1.5 text-[12.5px] text-ink-3">{label}</p>
              </div>
            ))}
          </div>
          <button type="button" className="mt-4 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => onView("attendance")}>
            See my attendance →
          </button>
        </div>

        <div className="card p-5">
          <p className="eyebrow">Coming up</p>
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
        <h1 className="text-[34px] leading-[1.1] text-ink">{title}</h1>
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
  summary: { totalDays: number; deductionDays: number; paidDays: number; perDay?: number; gross?: number; deductions?: number; net?: number; adjustment?: number; adjustment_note?: string | null };
  employees?: Employee[];
};

function dayTone(status: string) {
  if (["Present", "Holiday", "Paid leave", "Paid", "Paid by admin"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["Half day", "No check-in", "Half Day", "Half day (admin)"].includes(status)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (["Absent", "Unpaid leave", "Unpaid", "Unpaid (admin)", "Not joined", "Leave"].includes(status)) return "bg-rose-50 text-rose-700 border-rose-200";
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
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Days in month</p><p className="text-lg font-bold text-ink">{data.summary.totalDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Per day</p><p className="tnum text-lg font-bold text-ink">{currency.format(data.summary.perDay ?? 0)}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Paid days</p><p className="text-lg font-bold text-emerald-600">{data.summary.paidDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Deduction days</p><p className="text-lg font-bold text-rose-600">{data.summary.deductionDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-ink-3">Deductions</p><p className="tnum text-lg font-bold text-rose-600">-{currency.format(data.summary.deductions ?? 0)}</p></div>
              {data.summary.adjustment ? (
                <div className="rounded-xl border border-line p-3" title={data.summary.adjustment_note ?? undefined}>
                  <p className="text-[11px] font-semibold uppercase text-ink-3">{data.summary.adjustment > 0 ? "Addition" : "Extra deduction"}</p>
                  <p className={classNames("tnum text-lg font-bold", data.summary.adjustment > 0 ? "text-emerald-600" : "text-rose-600")}>
                    {data.summary.adjustment > 0 ? "+" : "−"}{currency.format(Math.abs(data.summary.adjustment))}
                  </p>
                  {data.summary.adjustment_note ? <p className="truncate text-[11px] text-ink-3">{data.summary.adjustment_note}</p> : null}
                </div>
              ) : null}
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
  single: "#FF6600",
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
                  <span className={classNames("badge hidden w-full justify-center !px-1 !text-[9px] sm:inline-flex", statusTone(attendanceLabel(one)))}>
                    {one.override_type ? attendanceLabel(one) : one.missed_checkout ? "No check-out" : attendanceLabel(one)}
                  </span>
                  <span className="mx-auto block h-2 w-2 rounded-full sm:hidden"
                    style={{ background: attendanceColour(one) }} />
                  {one.check_in ? <p className="tnum mt-1 text-center text-[9.5px] text-ink-3">{one.check_in.slice(0, 5)}</p> : null}
                </div>
              ) : records.length ? (
                <div className="mt-1.5">
                  <div className="flex flex-wrap gap-[3px]">
                    {records.slice(0, 8).map((r) => (
                      <span key={r.id} title={`${r.employee_name}: ${r.status}`}
                        className="h-[7px] w-[7px] rounded-full"
                        style={{ background: attendanceColour(r) }} />
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
        <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <span className="h-2 w-2 rounded-full ring-2 ring-emerald-200" style={{ background: VIZ.good }} />
          Paid by admin
        </span>
      </div>
    </div>
  );
}

// What a record is called on screen. A missed check-out is stored as leave, and
// says so.
function attendanceLabel(r: Pick<AttendanceRecord, "status" | "missed_checkout" | "override_type">) {
  // What the admin decided about a day outranks what the clock recorded.
  if (r.override_type === "Paid") return "Paid by admin";
  if (r.override_type === "Half Day") return "Half day (admin)";
  if (r.override_type === "Unpaid") return "Unpaid (admin)";
  if (r.status === "On Leave") return "Leave";
  return r.status;
}

function attendanceColour(r: AttendanceRecord) {
  if (r.override_type === "Paid") return VIZ.good;
  if (r.override_type === "Half Day") return VIZ.serious;
  if (r.override_type === "Unpaid") return VIZ.critical;
  return STATUS_COLOUR[r.status] ?? VIZ.neutral;
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
  // Calendar for the shape of the month, list for reading times row by row.
  // Whichever you last used opens next time.
  const [layout, setLayout] = useState<"calendar" | "list">(() => {
    try { return localStorage.getItem("fast_hrms_attendance_view") === "list" ? "list" : "calendar"; } catch { return "calendar"; }
  });
  useEffect(() => { try { localStorage.setItem("fast_hrms_attendance_view", layout); } catch { /* private mode */ } }, [layout]);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  async function load() {
    const search = new URLSearchParams({ start: monthStart, end: monthEnd });
    if (isAdmin && employeeId) search.set("employeeId", employeeId);
    const data = await api<{ attendance: AttendanceRecord[]; employees?: Employee[]; overrides?: Array<{ employee_id: number; day: string; day_type: "Paid" | "Half Day" | "Unpaid"; reason?: string | null; employee_name?: string }> }>(`/attendance?${search.toString()}`);
    // Days the admin decided on with no check-in at all still belong on the calendar.
    const decided: AttendanceRecord[] = (data.overrides ?? []).map((o, i) => ({
      id: -(i + 1), employee_id: o.employee_id, employee_name: o.employee_name, attendance_date: o.day,
      total_hours: 0, status: "Absent", override_type: o.day_type, override_reason: o.reason ?? null,
    }));
    setRows([...data.attendance, ...decided]);
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
    for (const r of rows) if (!r.override_type && t[r.status] !== undefined) t[r.status] += 1;
    return t;
  }, [rows]);
  const granted = rows.filter((r) => r.override_type === "Paid").length;

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
        description={layout === "list"
          ? (isAdmin ? "Every check-in this month. Edit a row to fix it." : "Every day you checked in this month.")
          : (isAdmin ? "Click any day to see who was in, and to fix a record." : "Your month at a glance. Click a day for its times.")}
      />

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <MonthStepper month={month} year={year} max={{ month: now.getMonth() + 1, year: now.getFullYear() }}
          onChange={(m, y) => { setMonth(m); setYear(y); }} />
        {isAdmin ? <PersonPicker value={employeeId} onChange={setEmployeeId} people={employees} /> : null}
        <div className="flex gap-1 rounded-full bg-sunk p-1">
          {(["calendar", "list"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setLayout(v)}
              className={classNames("rounded-full px-3 py-1 text-xs font-semibold capitalize transition",
                layout === v ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
              {v}
            </button>
          ))}
        </div>
        <p className="tnum ml-auto text-[12.5px] text-ink-3">
          {single
            ? `${tally.Present + tally.Late} present · ${tally.Late} late · ${tally["Half Day"]} half · ${tally["On Leave"]} leave · ${tally.Absent} absent${granted ? ` · ${granted} paid by admin` : ""}`
            : `${activePeople.length} people · ${rows.filter((r) => r.status === "Present" || r.status === "Late").length} check-ins this month`}
        </p>
      </div>

      {picked && picked.employment_status !== "Active" ? (
        <p className="text-[12.5px] font-medium text-ink-3">Showing a former employee.</p>
      ) : null}

      {layout === "calendar" ? (
        <AttendanceCalendar year={year} month={month} byDay={byDay} headcount={activePeople.length || 1} single={single} onDay={setOpenDay} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  <th className="whitespace-nowrap px-5 py-2.5">Date</th>
                  {isAdmin ? <th className="whitespace-nowrap px-5 py-2.5">Employee</th> : null}
                  <th className="whitespace-nowrap px-5 py-2.5">Check in</th>
                  <th className="whitespace-nowrap px-5 py-2.5">Check out</th>
                  <th className="whitespace-nowrap px-5 py-2.5">Worked</th>
                  <th className="whitespace-nowrap px-5 py-2.5">Status</th>
                  {isAdmin ? <th className="whitespace-nowrap px-5 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.length ? [...rows].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date) || (a.employee_name ?? "").localeCompare(b.employee_name ?? "")).map((r) => (
                  <tr key={r.id} className="bg-white hover:bg-[var(--surface-sunk)]">
                    <td className="tnum whitespace-nowrap px-5 py-3 text-ink-2">
                      {new Date(`${r.attendance_date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                    </td>
                    {isAdmin ? <td className="px-5 py-3 font-semibold text-ink">{r.employee_name}</td> : null}
                    <td className="tnum px-5 py-3 text-ink-2">
                      {r.check_in?.slice(0, 5) ?? "—"}
                      {r.late_checkin_reason ? <span className="block text-[11px] text-amber-700">{r.late_checkin_reason}</span> : null}
                    </td>
                    <td className="tnum px-5 py-3 text-ink-2">
                      {r.check_out?.slice(0, 5) ?? (r.missed_checkout ? <span className="text-rose-600">Missed</span> : "—")}
                      {r.early_checkout_reason ? <span className="block text-[11px] text-amber-700">{r.early_checkout_reason}</span> : null}
                    </td>
                    <td className="tnum px-5 py-3 text-ink-2">{r.check_in && r.check_out ? workedHMS(r) : "—"}</td>
                    <td className="px-5 py-3"><Badge value={attendanceLabel(r)} /></td>
                    {isAdmin ? (
                      <td className="px-5 py-3 text-right">
                        {r.id > 0 ? <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => startEdit(r)}><Pencil size={13} />Edit</button> : null}
                      </td>
                    ) : null}
                  </tr>
                )) : (
                  <tr><td colSpan={isAdmin ? 7 : 5} className="px-5 py-12 text-center text-[13.5px] text-ink-3">Nothing recorded this month.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                    {r.override_type ? <p className="mt-0.5 text-[12px] font-medium text-emerald-700">{r.override_reason || "Set by admin"}</p>
                      : r.missed_checkout ? <p className="mt-0.5 text-[12px] font-medium text-rose-600">Didn't check out — counted as leave</p> : null}
                    {r.late_checkin_reason ? <p className="mt-0.5 text-[12px] text-amber-700">Late: {r.late_checkin_reason}</p> : null}
                    {r.early_checkout_reason ? <p className="mt-0.5 text-[12px] text-amber-700">Left early: {r.early_checkout_reason}</p> : null}
                  </div>
                  <Badge value={attendanceLabel(r)} />
                  {isAdmin && r.id > 0 ? <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => startEdit(r)}><Pencil size={13} />Edit</button> : null}
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

// "19 Nov", or "19 Nov 2025" outside the current year.
function prettyDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
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
                  <p className="tnum stat mt-1 text-[28px] leading-none text-ink">
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
          <p className="eyebrow">Waiting for you · {pending.length}</p>
          {list(pending, true)}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">{isAdmin ? "All leave" : "My requests"}</p>
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
  // Editing pay: an amount added (bonus) or taken off (extra deduction), with a reason.
  const [adjusting, setAdjusting] = useState<Salary | null>(null);
  const [adjust, setAdjust] = useState({ kind: "add" as "add" | "deduct", amount: "", note: "" });
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

  function startAdjust(row: Salary) {
    const a = Number(row.adjustment) || 0;
    setAdjust({ kind: a < 0 ? "deduct" : "add", amount: a ? String(Math.abs(a)) : "", note: row.adjustment_note ?? "" });
    setAdjusting(row);
  }

  async function saveAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjusting) return;
    const amount = Math.round(Number(adjust.amount) || 0);
    setBusy(true); setMessage("");
    try {
      await api(`/payroll/${adjusting.id}`, { method: "PUT", body: JSON.stringify({
        adjustment: adjust.kind === "deduct" ? -amount : amount,
        adjustment_note: adjust.note.trim(),
      }) });
      setAdjusting(null);
      setOpenId(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save");
    }
    setBusy(false);
  }

  async function payInFull(row: Salary) {
    if (!window.confirm(`Pay ${row.employee_name} in full for ${monthNames[row.salary_month - 1]} ${row.salary_year}?\n\nEvery cut day (leave, absent, half day, missed check-out) will show as "Paid by admin" in their attendance, and no salary is deducted.`)) return;
    setBusy(true); setMessage("");
    try {
      await api(`/payroll/${row.id}/pay-in-full`, { method: "POST" });
      setAdjusting(null);
      setOpenId(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update");
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
                        {row.adjustment ? ` · ${row.adjustment > 0 ? "+" : "−"}${currency.format(Math.abs(row.adjustment))} ${row.adjustment_note ?? ""}` : ""}
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
                    {isAdmin ? <button type="button" className="btn btn-ghost px-2.5 py-1.5 text-xs" onClick={() => startAdjust(row)}><Pencil size={14} />Edit</button> : null}
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

      {adjusting ? (() => {
        const amount = Math.round(Number(adjust.amount) || 0);
        const before = Number(adjusting.net_salary) - (Number(adjusting.adjustment) || 0);
        const after = before + (adjust.kind === "deduct" ? -amount : amount);
        return (
          <div className="modal-scrim items-center justify-center p-4">
            <form onSubmit={saveAdjust} className="card w-full max-w-md space-y-4 p-6">
              <div>
                <h3 className="text-lg font-bold text-ink">Edit {adjusting.employee_name}'s salary</h3>
                <p className="mt-1 text-sm text-ink-3">{monthNames[adjusting.salary_month - 1]} {adjusting.salary_year}. They'll see the change and the reason on their payslip.</p>
              </div>
              <div className="flex gap-1 rounded-full bg-sunk p-1">
                {([["add", "Add (bonus, incentive)"], ["deduct", "Deduct (advance, penalty)"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setAdjust({ ...adjust, kind: k })}
                    className={classNames("flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      adjust.kind === k ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
                    {label}
                  </button>
                ))}
              </div>
              {adjusting.deductions > 0 ? (
                <button type="button" disabled={busy} onClick={() => payInFull(adjusting)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-left transition hover:border-line-strong hover:bg-sunk">
                  <span>
                    <span className="block text-[13.5px] font-semibold text-ink">Pay in full — waive all cuts</span>
                    <span className="block text-[12px] text-ink-3">{currency.format(adjusting.deductions)} of cuts become days "Paid by admin"</span>
                  </span>
                  <ChevronRight size={16} className="text-ink-4" />
                </button>
              ) : null}
              <Field label="Amount (₹)">
                <input autoFocus className="input" type="number" min="0" step="1" value={adjust.amount}
                  onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Reason">
                <input className="input" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
                  placeholder={adjust.kind === "add" ? "e.g. Diwali bonus" : "e.g. Salary advance"} />
              </Field>
              <div className="tnum rounded-lg bg-sunk px-4 py-3 text-[13px] text-ink-2">
                From attendance {currency.format(before)}
                {amount ? ` ${adjust.kind === "deduct" ? "−" : "+"} ${currency.format(amount)}` : ""}
                {" = "}<span className="font-bold text-ink">{currency.format(after)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                {adjusting.adjustment ? (
                  <button type="button" className="text-xs font-semibold text-rose-600 hover:underline"
                    onClick={() => setAdjust({ ...adjust, amount: "0", note: "" })}>Remove change</button>
                ) : <span />}
                <div className="flex gap-3">
                  <button type="button" className="btn btn-soft" onClick={() => setAdjusting(null)}>Cancel</button>
                  <button className="btn btn-primary" disabled={busy || (amount > 0 && !adjust.note.trim())}>{busy ? "Saving…" : "Save"}</button>
                </div>
              </div>
            </form>
          </div>
        );
      })() : null}

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
