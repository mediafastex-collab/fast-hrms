import {
  Banknote,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  History,
  Menu,
  Settings,
  Sparkles,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  Coffee,
  X,
  Image as ImageIcon,
  ClipboardList,
  MessageSquare,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Role = "Superadmin" | "Employee";
type View =
  | "dashboard"
  | "employees"
  | "departments"
  | "attendance"
  | "tasks"
  | "chat"
  | "leave"
  | "payroll"
  | "holidays"
  | "reports"
  | "settings"
  | "audit"
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
type Task = {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  task_date: string;
  title: string;
  company?: string | null;
  priority: "High" | "Medium" | "Low";
  status: "Pending" | "In Progress" | "Completed";
  notes?: string | null;
  assigned_by_admin?: number;
  deadline?: string | null;
};
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
  lastMonthLabel?: string;
};

type EmployeeSummary = {
  todayAttendance?: AttendanceRecord;
  monthAttendance: { present: number; late: number; halfDay: number; absent: number };
  leaveBalance: number;
  recentLeaves: LeaveRequest[];
  currentSalary?: Salary;
  latestSalary?: Salary;
  upcomingLeaves?: LeaveRequest[];
  upcomingHolidays?: Holiday[];
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

// Break cell for logs: every break of the day, plus total time.
function BreaksCell({ row }: { row: AttendanceRecord }) {
  const breaks = row.breaks && row.breaks.length
    ? row.breaks
    : row.break_start ? [{ id: 0, break_start: row.break_start, break_end: row.break_end ?? null }] : [];
  if (!breaks.length) return <span>-</span>;
  const totalSec = closedBreakSeconds(row);
  const totalMin = Math.round(totalSec / 60);
  return (
    <div className="space-y-0.5">
      {breaks.map((b, i) => (
        <div key={b.id || i} className="whitespace-nowrap">
          {b.break_start} - {b.break_end ?? <span className="font-semibold text-amber-600">on break</span>}
        </div>
      ))}
      {totalSec > 0 && <div className="text-[10px] text-slate-500">{breaks.length} break{breaks.length > 1 ? "s" : ""} · {Math.floor(totalMin / 60) ? `${Math.floor(totalMin / 60)}h ` : ""}{totalMin % 60}m</div>}
    </div>
  );
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
  if (["Done", "Approved", "Present"].includes(status)) return "bg-emerald-50 text-emerald-700";
  if (["Pending", "Late", "Half Day"].includes(status)) return "bg-amber-50 text-amber-700";
  if (["Rejected", "Absent", "Inactive"].includes(status)) return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
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
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
        <div className="rounded-md bg-sky-50 p-2 text-brand">
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {action ? <div className="mt-4">{action}</div> : null}
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
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-4 text-white shadow-lg shadow-orange-500/30">
            <BriefcaseBusiness size={34} />
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-ink">
            Fastex <span className="text-brand">HRMS</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to your workspace</p>
        </div>

        <form onSubmit={submit} className="card p-6 sm:p-7 space-y-4">
          {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div> : null}
          <Field label="Email">
            <input required autoFocus className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@fastexmedia.com" />
          </Field>
          <Field label="Password">
            <input required className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
          </Field>
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} Fastex Media</p>
      </div>
    </main>
  );
}

function Shell({ user, view, onView, onLogout }: { user: User; view: View; onView: (view: View) => void; onLogout: () => void }) {
  const isAdmin = user.role === "Superadmin";
  const [mobileOpen, setMobileOpen] = useState(false);
  // Collapsed rail vs. full-width nav, remembered between visits.
  const [chatTarget, setChatTarget] = useState<number | null>(null);
  // Polled once for the whole app so messages reach you on any screen.
  const chatChannels = useChatPulse(user.id, view === "chat");
  const [navOpen, setNavOpen] = useState(() => localStorage.getItem("fast_hrms_nav") !== "collapsed");
  useEffect(() => { localStorage.setItem("fast_hrms_nav", navOpen ? "open" : "collapsed"); }, [navOpen]);
  const nav = [
    { id: "dashboard" as View, label: "Dashboard", icon: LayoutDashboard, show: true },
    { id: "employees" as View, label: "Employees", icon: UsersRound, show: isAdmin },
    { id: "departments" as View, label: "Departments", icon: Building2, show: isAdmin },
    { id: "attendance" as View, label: "Attendance", icon: CalendarCheck, show: true },
    { id: "tasks" as View, label: "Tasks", icon: ClipboardList, show: true },
    { id: "chat" as View, label: "Chat", icon: MessageSquare, show: true },
    { id: "leave" as View, label: "Leave", icon: FileText, show: true },
    { id: "payroll" as View, label: "Payroll", icon: Banknote, show: true },
    { id: "holidays" as View, label: "Holidays", icon: Sparkles, show: true },
    { id: "reports" as View, label: "Reports", icon: Download, show: isAdmin },
    { id: "settings" as View, label: "Settings", icon: Settings, show: isAdmin },
    { id: "audit" as View, label: "Audit Logs", icon: History, show: isAdmin },
    { id: "profile" as View, label: "Profile", icon: UserRound, show: !isAdmin },
  ].filter((item) => item.show);

  function choose(next: View) {
    onView(next);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen bg-cloud">
      <aside className={classNames(
        "fixed inset-y-0 left-0 z-20 hidden border-r border-line bg-white p-4 transition-all lg:block",
        navOpen ? "w-64" : "w-20",
      )}>
        <div className={classNames("flex items-center gap-3 py-3", navOpen ? "px-2" : "justify-center px-0")}>
          <div className="rounded-md bg-brand p-2 text-white">
            <BriefcaseBusiness size={20} />
          </div>
          {navOpen ? (
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">Fast HRMS</p>
              <p className="text-xs text-slate-500">{user.role}</p>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setNavOpen((open) => !open)}
          title={navOpen ? "Collapse menu" : "Expand menu"}
          className={classNames(
            "mt-2 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-ink",
            !navOpen && "justify-center px-0",
          )}
        >
          <Menu size={16} />
          {navOpen ? "Collapse" : null}
        </button>

        <nav className="mt-3 space-y-1">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => choose(item.id)}
              title={navOpen ? undefined : item.label}
              className={classNames(
                "flex w-full items-center rounded-md py-2 text-sm font-semibold transition",
                navOpen ? "gap-3 px-3" : "justify-center px-0",
                view === item.id ? "bg-sky-50 text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-ink",
              )}
            >
              <item.icon size={18} />
              {navOpen ? item.label : null}
            </button>
          ))}
        </nav>
      </aside>

      <div className={navOpen ? "lg:pl-64" : "lg:pl-20"}>
        <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Welcome</p>
              <h2 className="text-lg font-bold text-ink">{user.displayName ?? user.employeeName ?? user.email}</h2>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <button className="btn btn-soft lg:hidden" onClick={() => setMobileOpen((open) => !open)} title="Menu">
                <Menu size={17} />
              </button>
              <span className="hidden rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 sm:inline-flex">{user.role}</span>
              <button className="btn btn-soft" onClick={onLogout} title="Logout">
                <LogOut size={17} />
                <span className="hidden sm:inline">Logout</span>
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

        <main className={classNames("mx-auto px-4 py-6", view === "chat" ? "max-w-none" : "max-w-7xl")}>
          {view === "dashboard" ? user.role === "Superadmin" ? <AdminDashboard /> : <EmployeeDashboard /> : null}
          {view === "employees" && isAdmin ? <Employees /> : null}
          {view === "departments" && isAdmin ? <Departments /> : null}
          {view === "attendance" ? <Attendance isAdmin={isAdmin} /> : null}
          {view === "tasks" ? <Tasks isAdmin={isAdmin} /> : null}
          {view === "chat" ? <Chat currentUserId={user.id} initialChannelId={chatTarget} /> : null}
          {view === "leave" ? <Leave isAdmin={isAdmin} /> : null}
          {view === "payroll" ? <Payroll isAdmin={isAdmin} /> : null}
          {view === "holidays" ? <Holidays isAdmin={isAdmin} /> : null}
          {view === "reports" && isAdmin ? <Reports /> : null}
          {view === "settings" && isAdmin ? <SettingsPage /> : null}
          {view === "audit" && isAdmin ? <AuditLogs /> : null}
          {view === "profile" && !isAdmin ? <Profile /> : null}
        </main>
      </div>

      {/* The dock stands in for chat everywhere except the chat screen itself. */}
      {view !== "chat" ? (
        <MessengerDock channels={chatChannels} onOpen={(id) => { setChatTarget(id); choose("chat"); }} />
      ) : null}
    </div>
  );
}

function AdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ summary: DashboardSummary }>("/admin/summary")
      .then((data) => setSummary(data.summary))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <EmptyState title={error} />;
  if (!summary) return <EmptyState title="Loading dashboard..." />;

  return (
    <section className="space-y-5">
      <PageTitle title="Dashboard" description="Today's attendance and last month's payroll at a glance." />

      {/* Headline: what actually needs paying */}
      <div className="card border-l-4 border-l-brand bg-gradient-to-r from-orange-50 to-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Payable · {summary.lastMonthLabel ?? "last month"}</p>
        <p className="mt-1 text-4xl font-extrabold text-ink">{currency.format(summary.lastMonthPayable ?? 0)}</p>
        <p className="mt-1 text-sm text-slate-500">Actual amount after attendance deductions, across {summary.totalEmployees} active employee{summary.totalEmployees === 1 ? "" : "s"}.</p>
      </div>

      {/* Today */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Today</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={UsersRound} label="Employees" value={summary.totalEmployees} />
          <StatCard icon={CalendarCheck} label="Present" value={summary.presentToday} />
          <StatCard icon={Clock3} label="Not marked" value={summary.absentToday} />
        </div>
      </div>

      {/* Needs attention */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Needs attention</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={FileText} label="Leave requests pending" value={summary.pendingLeaveRequests} />
          <StatCard icon={Banknote} label="Salaries unpaid" value={summary.pendingSalaries} />
          <StatCard icon={CheckCircle2} label="Salaries paid" value={summary.salaryDoneCount} />
        </div>
      </div>
    </section>
  );
}

// Everyday work motivation for the team — about doing good work, not building a business.
const QUOTES = [
  "Do the small things well and the big things follow.",
  "Progress today beats perfection tomorrow.",
  "Your effort today is someone's reason to trust you tomorrow.",
  "Focus on one task at a time — that's where good work hides.",
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
];

function EmployeeDashboard() {
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const quote = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    return QUOTES[dayOfYear % QUOTES.length];
  }, []);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [message, setMessage] = useState("");
  
  // Timer State
  const [elapsed, setElapsed] = useState<number>(0);
  
  // Reason Prompts
  const [promptCheckIn, setPromptCheckIn] = useState(false);
  const [promptCheckOut, setPromptCheckOut] = useState(false);
  const [reason, setReason] = useState("");

  async function load() {
    const data = await api<{ summary: EmployeeSummary }>("/employee/summary");
    const settingsData = await api<{ settings: CompanySettings }>("/settings");
    setSummary(data.summary);
    setSettings(settingsData.settings);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);
  
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const att = summary?.todayAttendance;
    if (att?.check_in && !att.check_out) {
      const tick = () => {
        const now = new Date();
        const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        let seconds = nowSec - (timeToSeconds(att.check_in) ?? 0);
        // Subtract every finished break, plus the ongoing one if on a break now.
        seconds -= closedBreakSeconds(att);
        const open = openBreakOf(att);
        if (open) seconds -= Math.max(0, nowSec - (timeToSeconds(open.break_start) ?? nowSec));
        setElapsed(Math.max(0, seconds));
      };
      tick();
      interval = setInterval(tick, 1000);
    }
    return () => clearInterval(interval);
  }, [summary]);

  function formatTime(s: number) {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  }
  
  async function punch(action: "check-in" | "check-out" | "break-start" | "break-end", reasonData?: string) {
    setMessage("");
    try {
      const body = reasonData ? (action === "check-in" ? { late_checkin_reason: reasonData } : { early_checkout_reason: reasonData }) : {};
      await api(`/attendance/${action}`, { method: "POST", body: Object.keys(body).length ? JSON.stringify(body) : undefined });
      setPromptCheckIn(false);
      setPromptCheckOut(false);
      setReason("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Attendance update failed");
    }
  }
  
  function handleCheckInClick() {
    if (settings) {
       const now = new Date();
       const current = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;
       if (current > settings.late_mark_time) {
         setPromptCheckIn(true);
         return;
       }
    }
    punch("check-in");
  }
  
  function handleCheckOutClick() {
    if (settings) {
       const hoursWorked = elapsed / 3600;
       if (hoursWorked < settings.shift_min_hours) {
         setPromptCheckOut(true);
         return;
       }
    }
    punch("check-out");
  }

  if (!summary) return <EmptyState title={message || "Loading dashboard..."} />;
  const isSunday = new Date().getDay() === 0;
  const hasCheckedIn = Boolean(summary.todayAttendance?.check_in);
  const hasCheckedOut = Boolean(summary.todayAttendance?.check_out);
  const onBreak = Boolean(openBreakOf(summary.todayAttendance));

  return (
    <section className="space-y-5 animate-fade-in">
      <div className="card overflow-hidden border-l-4 border-l-brand bg-gradient-to-r from-orange-50 via-amber-50 to-white p-6">
        <div className="flex items-start gap-4">
          <span className="select-none text-4xl font-serif leading-none text-brand/40">&ldquo;</span>
          <div>
            <p className="text-lg font-semibold italic leading-relaxed text-ink">{quote}</p>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-brand/70">Today&rsquo;s inspiration</p>
          </div>
        </div>
      </div>
      {promptCheckIn && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4">
           <div className="card w-full max-w-md p-6">
             <h3 className="text-lg font-bold text-ink">Late Check-in</h3>
             <p className="mt-2 text-sm text-slate-500">You are checking in late. Please provide a reason.</p>
             <input autoFocus className="input mt-4" placeholder="Traffic, transit delay, etc." value={reason} onChange={e => setReason(e.target.value)} />
             <div className="mt-5 flex gap-3 justify-end">
               <button className="btn btn-soft" onClick={() => setPromptCheckIn(false)}>Cancel</button>
               <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => punch("check-in", reason)}>Check in</button>
             </div>
           </div>
         </div>
      )}
      {promptCheckOut && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4">
           <div className="card w-full max-w-md p-6">
             <h3 className="text-lg font-bold text-ink">Early Check-out</h3>
             <p className="mt-2 text-sm text-slate-500">You haven't completed your minimum shift hours. Please provide a reason.</p>
             <input autoFocus className="input mt-4" placeholder="Personal work, medical, etc." value={reason} onChange={e => setReason(e.target.value)} />
             <div className="mt-5 flex gap-3 justify-end">
               <button className="btn btn-soft" onClick={() => setPromptCheckOut(false)}>Cancel</button>
               <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => punch("check-out", reason)}>Check out</button>
             </div>
           </div>
         </div>
      )}
      <PageTitle title="My Day" description="Mark your attendance and see what's coming up." />
      {message ? <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-700">{message}</div> : null}
      <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
        <div className="card p-6 border-t-4 border-t-brand">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="label">Today attendance</p>
              <h3 className="mt-2 text-3xl font-extrabold text-ink bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">{summary.todayAttendance?.status ?? "Not marked"}</h3>
              <p className="mt-2 text-sm text-slate-500 flex gap-3 items-center">
                <span><span className="font-medium">In:</span> {summary.todayAttendance?.check_in ?? "--"}</span>
                <span className="h-4 w-px bg-slate-300 block"></span>
                <span><span className="font-medium">Out:</span> {summary.todayAttendance?.check_out ?? "--"}</span>
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-3">
              {hasCheckedIn && !hasCheckedOut && (
                <div className="text-2xl font-mono font-bold text-brand bg-brand/5 px-4 py-1.5 rounded-lg border border-brand/10">
                  {formatTime(elapsed)}
                </div>
              )}
              <div className="flex gap-2">
                {isSunday ? (
                   <span className="badge bg-slate-100 text-slate-600 px-4 py-2 text-sm border border-slate-200">Weekend (No check-in)</span>
                ) : !hasCheckedIn ? (
                   <button className="btn btn-primary px-8" onClick={handleCheckInClick}><Clock3 size={18} /> Check in</button>
                ) : !hasCheckedOut ? (
                   <>
                     {onBreak ? (
                       <button className="btn btn-success" onClick={() => punch("break-end")}><CheckCircle2 size={18} /> End Break</button>
                     ) : (
                       <button className="btn btn-soft" onClick={() => punch("break-start")}><Coffee size={18} /> Take Break</button>
                     )}
                     <button className="btn btn-danger" onClick={handleCheckOutClick}><LogOut size={18} /> Check out</button>
                   </>
                ) : (
                   <span className="badge bg-slate-100 text-slate-600 px-4 py-2 text-sm border border-slate-200">Shift Completed</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={CalendarCheck} label="Present" value={summary.monthAttendance.present} sub="This month" />
          <StatCard icon={Clock3} label="Late" value={summary.monthAttendance.late} sub="This month" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-orange-50 p-2 text-brand"><FileText size={18} /></span>
            <h3 className="font-bold text-ink">Upcoming leaves</h3>
          </div>
          <div className="mt-4 space-y-2">
            {summary.upcomingLeaves && summary.upcomingLeaves.length ? summary.upcomingLeaves.map((leave) => (
              <div key={leave.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">{leave.leave_type_name}</p>
                  <p className="text-xs text-slate-500">{leave.start_date} → {leave.end_date} · {leave.days} day{leave.days === 1 ? "" : "s"}</p>
                </div>
                <Badge value="Approved" />
              </div>
            )) : <p className="text-sm text-slate-500">No approved upcoming leave.</p>}
          </div>
        </div>
        <div className="card border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-5 shadow-md shadow-amber-500/10">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-amber-400 p-2 text-white shadow-sm"><Sparkles size={18} /></span>
            <h3 className="font-bold text-ink">Upcoming holidays</h3>
            {summary.upcomingHolidays && summary.upcomingHolidays.length ? (
              <span className="badge bg-amber-400 text-white">{summary.upcomingHolidays.length}</span>
            ) : null}
          </div>
          <div className="mt-4 space-y-2">
            {summary.upcomingHolidays && summary.upcomingHolidays.length ? summary.upcomingHolidays.map((holiday) => {
              const days = Math.round((Date.parse(holiday.holiday_date) - Date.parse(today)) / 86400000);
              return (
                <div key={holiday.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-sm">
                  <div>
                    <p className="font-bold text-ink">{holiday.name}</p>
                    {holiday.description ? <p className="text-xs text-slate-500">{holiday.description}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-amber-700">{holiday.holiday_date}</p>
                    <p className="text-[11px] font-semibold text-amber-600">
                      {days <= 0 ? "Today 🎉" : days === 1 ? "Tomorrow" : `in ${days} days`}
                    </p>
                  </div>
                </div>
              );
            }) : <p className="text-sm text-slate-500">No upcoming holidays.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function PageTitle({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action}
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
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-bold text-ink">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map(([label]) => (
                <th key={label} className="px-4 py-3 font-bold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} className="bg-white">
                  {columns.map(([label, render]) => (
                    <td key={label} className="px-4 py-3 align-top text-slate-700">
                      {render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={columns.length}>
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
  const [editing, setEditing] = useState<Employee | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    const data = await api<{ employees: Employee[]; departments: Department[]; designations: Designation[] }>("/employees");
    setEmployees(data.employees);
    setDepartments(data.departments);
    setDesignations(data.designations);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return employees.filter((employee) => [employee.full_name, employee.email, employee.employee_code].join(" ").toLowerCase().includes(needle));
  }, [employees, query]);

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
        title="Employee Management"
        description="Add people, assign departments and salaries, and manage login access."
        action={
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus size={17} />
            Add employee
          </button>
        }
      />
      <div className="card p-3">
        <div className="flex items-center gap-2">
          <Search size={18} className="text-slate-400" />
          <input className="input border-0 focus:ring-0" placeholder="Search employees" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>
      <DataTable
        title="Employees"
        rows={filtered}
        columns={[
          ["Employee", (row) => <div className="font-semibold text-ink">{row.full_name}<div className="text-xs font-normal text-slate-500">{row.employee_code}</div></div>],
          ["Email", (row) => row.email],
          ["Department", (row) => row.department_name ?? "-"],
          ["Designation", (row) => row.designation_name ?? "-"],
          ["Salary", (row) => currency.format(row.monthly_salary)],
          ["Status", (row) => <Badge value={row.employment_status} />],
          [
            "Action",
            (row) => (
              <button
                className="btn btn-soft"
                onClick={() => {
                  setEditing(row);
                  setOpen(true);
                }}
              >
                Edit
              </button>
            ),
          ],
        ]}
      />
      {open ? (
        <EmployeeModal
          employee={editing}
          departments={departments}
          designations={designations}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={save}
        />
      ) : null}
    </section>
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
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-900/40 p-4">
      <form onSubmit={submit} className="card mx-auto max-w-3xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink">{employee ? "Edit employee" : "Add employee"}</h2>
            <p className="text-sm text-slate-500">Employee profile, salary, bank details, and login.</p>
          </div>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Close
          </button>
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
          <Field label="Employment status">
            <select className="input" value={form.employment_status} onChange={(e) => update("employment_status", e.target.value)}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </Field>
          <Field label={employee ? "Reset password" : "Login password"}><input className="input" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder={employee ? "Leave blank to keep current" : "password123"} /></Field>
          <Field label="Bank name"><input className="input" value={form.bank_name} onChange={(e) => update("bank_name", e.target.value)} /></Field>
          <Field label="Account number"><input className="input" value={form.account_number} onChange={(e) => update("account_number", e.target.value)} /></Field>
          <Field label="IFSC code"><input className="input" value={form.ifsc_code} onChange={(e) => update("ifsc_code", e.target.value)} /></Field>
          <Field label="Address"><textarea className="input min-h-24" value={form.address} onChange={(e) => update("address", e.target.value)} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : "Save employee"}</button>
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
      <PageTitle title="Departments & Designations" description="Keep company structure simple and reusable." />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Edit Department</h3>
            <p className="text-xs text-slate-500">Update {editingDept.name} and its shift hours. Leave shift fields blank to use the company default.</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">{checkingEmployeesDept.name} Employees</h3>
            <p className="text-xs text-slate-500">All employees in the {checkingEmployeesDept.name} department</p>
            <div className="max-h-96 overflow-y-auto">
              {allEmployees.length === 0 ? (
                <div className="p-4 text-center text-stone-500">Loading...</div>
              ) : (
                <div className="space-y-2">
                  {allEmployees.filter((e) => e.department_id === checkingEmployeesDept.id).length === 0 ? (
                    <div className="p-4 text-center text-stone-500">No employees found in this department.</div>
                  ) : (
                    allEmployees.filter((e) => e.department_id === checkingEmployeesDept.id).map((emp) => {
                      const desig = designations.find(d => d.id === emp.designation_id)?.name || "Unknown Designation";
                      return (
                        <div key={emp.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 p-3">
                          <div className="font-semibold text-stone-800">{emp.full_name}</div>
                          <div className="text-sm text-stone-500">{desig}</div>
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
            <span className="font-semibold text-slate-700">{row.name}</span>
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
  if (["Absent", "Unpaid leave", "Unpaid", "Not joined"].includes(status)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
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
      <div>
        <h3 className="font-bold text-ink">{showSalary ? "Salary day breakdown" : "Day-by-day attendance"}</h3>
        <p className="text-xs text-slate-500">
          {showSalary
            ? "How each day affects this salary. Per-day rate = monthly salary ÷ days in month."
            : "Every day of the month with its status. Sundays are paid weekly offs."}
        </p>
      </div>

      {message ? <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700">{message}</div> : null}

      {data ? (
        <>
          {showSalary ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Days in month</p><p className="text-lg font-bold text-ink">{data.summary.totalDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Per day</p><p className="text-lg font-bold text-ink">{currency.format(data.summary.perDay ?? 0)}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Paid days</p><p className="text-lg font-bold text-emerald-600">{data.summary.paidDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Deduction days</p><p className="text-lg font-bold text-rose-600">{data.summary.deductionDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Deductions</p><p className="text-lg font-bold text-rose-600">-{currency.format(data.summary.deductions ?? 0)}</p></div>
              <div className="rounded-xl border-2 border-brand/30 bg-orange-50 p-3"><p className="text-[11px] font-semibold uppercase text-brand">Net payable</p><p className="text-lg font-extrabold text-brand">{currency.format(data.summary.net ?? 0)}</p></div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Days in month</p><p className="text-lg font-bold text-ink">{data.summary.totalDays}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Present</p><p className="text-lg font-bold text-emerald-600">{data.days.filter((d) => d.status === "Present").length}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Half days</p><p className="text-lg font-bold text-amber-600">{data.days.filter((d) => d.status === "Half day" || d.status === "Half Day" || d.status === "No check-in").length}</p></div>
              <div className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Absent</p><p className="text-lg font-bold text-rose-600">{data.days.filter((d) => d.status === "Absent").length}</p></div>
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
                  ? (d.factor > 0 ? <p className="text-[10px] font-bold">-{currency.format((data.summary.perDay ?? 0) * d.factor)}</p> : <p className="text-[10px] opacity-70">Paid</p>)
                  : (d.hours > 0 ? <p className="text-[10px] opacity-70">{d.hours.toFixed(1)}h</p> : null)}
              </button>
            ))}
          </div>
          {isAdmin ? <p className="mt-3 text-[11px] text-slate-400">Click any day to override it as Paid / Half day / Unpaid.</p> : null}
        </>
      ) : <p className="mt-4 text-sm text-slate-500">Select an employee to see the breakdown.</p>}

      {editing && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4">
          <form onSubmit={saveOverride} className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Override {editing.day}</h3>
            <p className="text-xs text-slate-500">
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

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="font-bold text-ink">
          {isAdmin ? "Attendance correction requests" : "My correction requests"}
          {pending ? <span className="badge ml-2 bg-amber-50 text-amber-700">{pending} pending</span> : null}
        </h3>
        {!isAdmin ? <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Request correction</button> : null}
      </div>
      {message ? <div className="px-4 py-2 text-sm font-semibold text-amber-700">{message}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
            {requests.length ? requests.map((r) => (
              <tr key={r.id} className="bg-white">
                {isAdmin ? <td className="px-4 py-3 font-semibold text-ink">{r.employee_name}</td> : null}
                <td className="px-4 py-3">{r.attendance_date}</td>
                <td className="px-4 py-3">{r.request_type}</td>
                <td className="px-4 py-3">{r.request_type === "Timing" ? `${r.requested_check_in || "—"} → ${r.requested_check_out || "—"}` : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{r.reason || "—"}</td>
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
              <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={isAdmin ? 7 : 6}>No correction requests.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4">
          <form onSubmit={submit} className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Request attendance correction</h3>
            <p className="text-xs text-slate-500">Your admin will review this. Once approved it updates your attendance and salary automatically.</p>
            <Field label="Date"><input required className="input" type="date" value={form.attendance_date} onChange={(e) => setForm({ ...form, attendance_date: e.target.value })} /></Field>
            <Field label="What do you need?">
              <select className="input" value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })}>
                <option value="Timing">Fix check-in / check-out timing</option>
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

function Attendance({ isAdmin }: { isAdmin: boolean }) {
  const now = new Date();
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  // One month selector drives the calendar, the history table and (for admin) the employee.
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [employeeId, setEmployeeId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [editingAttendance, setEditingAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: 0,
    attendance_date: "",
    check_in: "",
    check_out: "",
    break_start: "",
    break_end: "",
    status: "Present"
  });

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  async function load() {
    const search = new URLSearchParams({ start: monthStart, end: monthEnd });
    if (isAdmin && employeeId) search.set("employeeId", employeeId);
    const data = await api<{ attendance: AttendanceRecord[]; employees?: Employee[] }>(`/attendance?${search.toString()}`);
    setRows(data.attendance);
    if (data.employees) {
      setEmployees(data.employees);
      if (isAdmin && !employeeId && data.employees[0]) setEmployeeId(String(data.employees[0].id));
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [month, year, employeeId, reloadKey]);

  async function mark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/attendance/manual", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    await load();
  }

  function handleEditClick(record: AttendanceRecord) {
    setEditingAttendance(record);
    setAttendanceForm({
      employee_id: record.employee_id,
      attendance_date: record.attendance_date,
      check_in: record.check_in ?? "",
      check_out: record.check_out ?? "",
      break_start: record.break_start ?? "",
      break_end: record.break_end ?? "",
      status: record.status
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingAttendance) return;
    try {
      await api("/attendance/manual", {
        method: "POST",
        body: JSON.stringify(attendanceForm),
      });
      setEditingAttendance(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to edit attendance record");
    }
  }

  const columns: Array<[string, (row: AttendanceRecord) => React.ReactNode]> = [
    ["Employee", (row) => row.employee_name ?? row.employee_code ?? "You"],
    ["Date", (row) => row.attendance_date],
    ["Check in", (row) => (
       <div>
         <div>{row.check_in ?? "-"}</div>
         {row.late_checkin_reason && <div className="text-[10px] text-amber-600 mt-0.5">{row.late_checkin_reason}</div>}
       </div>
    )],
    ["Check out", (row) => (
       <div>
         <div>{row.check_out ?? "-"}</div>
         {row.early_checkout_reason && <div className="text-[10px] text-amber-600 mt-0.5">{row.early_checkout_reason}</div>}
       </div>
    )],
    ["Breaks", (row) => <BreaksCell row={row} />],
    ["Worked", (row) => <span className="font-semibold text-ink">{workedHMS(row)}</span>],
    ["Status", (row) => <Badge value={row.status} />],
  ];

  if (isAdmin) {
    columns.push([
      "Action",
      (row) => (
        <button className="btn btn-soft" onClick={() => handleEditClick(row)}>Edit</button>
      )
    ]);
  }

  return (
    <section className="space-y-5">
      <PageTitle
        title="Attendance"
        description={isAdmin ? "Pick a month to review attendance, correct days, and mark records." : "Your attendance for the selected month."}
        action={isAdmin ? <a className="btn btn-soft" href={`/api/attendance.csv?${new URLSearchParams({ start: monthStart, end: monthEnd, ...(employeeId ? { employeeId } : {}) }).toString()}`}><Download size={17} />CSV</a> : null}
      />

      {/* One control bar drives the calendar and the history table below. */}
      <div className={classNames("card grid gap-3 p-4", isAdmin ? "md:grid-cols-4" : "md:grid-cols-3")}>
        {isAdmin ? (
          <Field label="Employee">
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Month">
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Field>
        <Field label="Year"><input className="input" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>
        <button type="button" className="btn btn-primary self-end" onClick={() => setReloadKey((k) => k + 1)}><RefreshCcw size={17} />Refresh</button>
      </div>

      {isAdmin ? (
        <form onSubmit={mark} className="card grid gap-3 p-4 md:grid-cols-6">
          <Field label="Employee"><select name="employee_id" className="input">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></Field>
          <Field label="Date"><input name="attendance_date" className="input" type="date" defaultValue={today} /></Field>
          <Field label="Check in"><input name="check_in" className="input" type="time" defaultValue="09:30" /></Field>
          <Field label="Check out"><input name="check_out" className="input" type="time" defaultValue="18:30" /></Field>
          <Field label="Status"><select name="status" className="input"><option>Present</option><option>Absent</option><option>Half Day</option><option>Late</option><option>On Leave</option></select></Field>
          <button className="btn btn-primary self-end">Mark</button>
        </form>
      ) : null}
      <DayRequests isAdmin={isAdmin} />

      <DataTable
        title="Attendance History"
        rows={rows}
        columns={columns}
      />

      {editingAttendance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 animate-fade-in">
          <form onSubmit={saveEdit} className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Edit Attendance Details</h3>
            <p className="text-xs text-slate-500">Modify times or status for {editingAttendance.employee_name} on {editingAttendance.attendance_date}.</p>
            
            <div className="grid grid-cols-2 gap-4">
              <Field label="Check In">
                <input className="input" type="time" value={attendanceForm.check_in} onChange={(e) => setAttendanceForm({ ...attendanceForm, check_in: e.target.value })} />
              </Field>
              <Field label="Check Out">
                <input className="input" type="time" value={attendanceForm.check_out} onChange={(e) => setAttendanceForm({ ...attendanceForm, check_out: e.target.value })} />
              </Field>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Field label="Break Start">
                <input className="input" type="time" value={attendanceForm.break_start} onChange={(e) => setAttendanceForm({ ...attendanceForm, break_start: e.target.value })} />
              </Field>
              <Field label="Break End">
                <input className="input" type="time" value={attendanceForm.break_end} onChange={(e) => setAttendanceForm({ ...attendanceForm, break_end: e.target.value })} />
              </Field>
            </div>

            <Field label="Status">
              <select className="input" value={attendanceForm.status} onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })}>
                <option>Present</option>
                <option>Absent</option>
                <option>Half Day</option>
                <option>Late</option>
                <option>On Leave</option>
              </select>
            </Field>

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" className="btn btn-soft" onClick={() => setEditingAttendance(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

type ChatChannel = {
  id: number; name: string | null; kind: "channel" | "dm"; unread: number;
  last_body?: string | null; last_at?: string | null; last_author?: string | null;
  last_user_id?: number | null; last_message_id?: number | null;
  peer_name?: string | null; peer_id?: number | null; peer_presence?: string | null;
};
type ChatMessage = {
  id: number; channel_id: number; user_id: number; body: string | null;
  reply_to_id?: number | null; reply_to_author?: string | null; reply_to_body?: string | null;
  attachment?: string | null; attachment_name?: string | null; deleted_at?: string | null;
  created_at: string; author_name: string;
};
type ChatPerson = { id: number; email: string; role: string; display_name: string; presence?: string | null };

// Green / amber / grey, the way every chat app signals presence.
function PresenceDot({ status, className }: { status?: string | null; className?: string }) {
  const tone = status === "online" ? "bg-emerald-500" : status === "away" ? "bg-amber-400" : "bg-slate-300";
  return <span title={presenceLabel(status)} className={classNames("inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white", tone, className)} />;
}

function presenceLabel(status?: string | null) {
  return status === "online" ? "Online" : status === "away" ? "Away" : "Offline";
}

// A desktop notification, when the browser has been given permission.
function notifyBrowser(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body: body.slice(0, 140), tag: `chat-${title}`, icon: "/favicon.svg" });
  } catch { /* some browsers only allow this from a service worker */ }
}

// One poll for the whole app: it feeds the messenger dock and raises a desktop
// notification whenever someone else's message lands.
function useChatPulse(currentUserId: number, muted: boolean) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const mutedRef = useRef(muted);
  const seen = useRef(new Map<number, number>());
  const primed = useRef(false);
  mutedRef.current = muted;

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const d = await api<{ channels: ChatChannel[] }>("/chat/channels");
        if (!alive) return;
        setChannels(d.channels);
        for (const c of d.channels) {
          const last = Number(c.last_message_id ?? 0);
          const before = seen.current.get(c.id);
          seen.current.set(c.id, last);
          // Never announce the backlog that was already there when the tab opened.
          if (!primed.current || before === undefined || last <= before) continue;
          if (Number(c.last_user_id) === currentUserId) continue;
          // Reading the chat screen right now is its own notification.
          if (mutedRef.current && document.visibilityState === "visible") continue;
          notifyBrowser(channelLabel(c), `${c.last_author ?? "Someone"}: ${c.last_body || "sent an attachment"}`);
        }
        primed.current = true;
      } catch { /* logged out or offline — try again next tick */ }
    }
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [currentUserId]);

  return channels;
}

// Messenger-style dock: a bubble with the unread count that opens a preview of
// recent conversations and drops you into the full chat screen.
function MessengerDock({ channels, onOpen }: { channels: ChatChannel[]; onOpen: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(typeof Notification === "undefined" ? "denied" : Notification.permission);
  const unread = channels.reduce((n, c) => n + (c.unread || 0), 0);
  const recent = [...channels]
    .filter((c) => c.last_at)
    .sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)))
    .slice(0, 6);

  async function askPermission() {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {open ? (
        <div className="mb-3 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="font-bold text-ink">Messages</h3>
            <button type="button" aria-label="Close messages" className="text-slate-400 hover:text-ink" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          {permission === "default" ? (
            <button type="button" onClick={askPermission}
              className="flex w-full items-center gap-2 border-b border-line bg-orange-50 px-4 py-2 text-left text-xs font-semibold text-brand">
              <Bell size={13} />Turn on desktop notifications
            </button>
          ) : null}
          <div className="max-h-80 overflow-y-auto">
            {recent.length ? recent.map((c) => (
              <button key={c.id} type="button" onClick={() => { setOpen(false); onOpen(c.id); }}
                className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-stone-50">
                <span className="relative shrink-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-700">
                    {c.kind === "dm" ? initialsOf(c.peer_name || "?") : "#"}
                  </span>
                  {c.kind === "dm" ? <PresenceDot status={c.peer_presence} className="absolute -bottom-0.5 -right-0.5" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{channelLabel(c)}</span>
                    {c.unread ? <span className="ml-auto shrink-0 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{c.unread}</span> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {c.last_author ? `${c.last_author}: ` : ""}{c.last_body || "Attachment"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">{c.last_at ? chatTime(c.last_at) : ""}</span>
                </span>
              </button>
            )) : <p className="px-4 py-8 text-center text-sm text-slate-500">No conversations yet.</p>}
          </div>
        </div>
      ) : null}
      <button type="button" onClick={() => setOpen((v) => !v)} title="Messages"
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:opacity-90">
        <MessageSquare size={22} />
        {unread ? <span className="absolute -right-0.5 -top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
    </div>
  );
}

function channelLabel(c: ChatChannel) {
  return c.kind === "dm" ? (c.peer_name || "Direct message") : `#${c.name}`;
}

function chatTime(ts: string) {
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

// Header bell — surfaces @mentions, DMs, leave decisions and salary updates.
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

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

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
                  <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
                </div>
              )) : <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing new.</p>}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// People without a full name fall back to their email, and "@aagam" reads a lot
// better than "@aagam@fastexmedia.com" — the server matches the handle either way.
function mentionToken(displayName: string) {
  return displayName.includes("@") ? displayName.split("@")[0] : displayName;
}

// Tint any "@Name" that matches a real teammate, so a mention is obvious in the
// thread and a mistyped one visibly isn't one.
function highlightMentions(body: string, people: ChatPerson[], onBrand = false) {
  const names = people.flatMap((p) => [p.display_name, mentionToken(p.display_name), p.display_name.split(" ")[0]]).filter(Boolean);
  if (!names.length) return body;
  const unique = [...new Set(names)].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = body.split(new RegExp(`(@(?:${unique.join("|")})(?![\\w.\\-]))`, "gi"));
  return parts.map((part, i) => (part.startsWith("@")
    ? <span key={i} className={classNames("rounded px-1 font-semibold", onBrand ? "bg-white/25 text-white" : "bg-orange-100 text-orange-700")}>{part}</span>
    : part));
}

function Chat({ currentUserId, initialChannelId }: { currentUserId: number; initialChannelId?: number | null }) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [file, setFile] = useState<{ data: string; name: string } | null>(null);
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [dmOpen, setDmOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  // @mention state: who can be named here, what's being typed after the "@",
  // and the ids picked from the menu so the server never has to guess.
  const [mentionable, setMentionable] = useState<ChatPerson[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const activeIdRef = useRef<number | null>(null);
  activeIdRef.current = activeId;

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionable.filter((p) => p.display_name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, mentionable]);

  function onDraftChange(value: string, caret: number) {
    setDraft(value);
    const token = value.slice(0, caret).match(/@([\w.\-]*)$/);
    setMentionQuery(token ? token[1] : null);
    setMentionIdx(0);
  }

  function insertMention(person: ChatPerson) {
    const area = draftRef.current;
    const caret = area?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@([\w.\-]*)$/, `@${mentionToken(person.display_name)} `);
    setDraft(before + draft.slice(caret));
    setMentionIds((ids) => (ids.includes(person.id) ? ids : [...ids, person.id]));
    setMentionQuery(null);
    requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(before.length, before.length); });
  }

  async function loadChannels() {
    try {
      const d = await api<{ channels: ChatChannel[] }>("/chat/channels");
      setChannels(d.channels);
      if (!activeIdRef.current && d.channels.length) setActiveId(d.channels[0].id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load channels");
    }
  }

  async function loadMessages(channelId: number, incremental = false) {
    try {
      const after = incremental && messages.length ? messages[messages.length - 1].id : 0;
      const d = await api<{ messages: ChatMessage[] }>(`/chat/channels/${channelId}/messages?after=${after}`);
      if (!d.messages.length) return;
      setMessages((prev) => (incremental ? [...prev, ...d.messages] : d.messages));
      const lastId = d.messages[d.messages.length - 1].id;
      await api(`/chat/channels/${channelId}/read`, { method: "POST", body: JSON.stringify({ last_message_id: lastId }) }).catch(() => undefined);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load messages");
    }
  }

  useEffect(() => {
    loadChannels();
    api<{ people: ChatPerson[] }>("/chat/directory").then((d) => setPeople(d.people)).catch(() => undefined);
  }, []);

  // Opened from the messenger dock — jump straight to that conversation.
  useEffect(() => { if (initialChannelId) setActiveId(initialChannelId); }, [initialChannelId]);

  useEffect(() => {
    if (!activeId) return;
    setMessages([]);
    setMentionIds([]); setMentionQuery(null);
    loadMessages(activeId);
    api<{ people: ChatPerson[] }>(`/chat/channels/${activeId}/mentionable`)
      .then((d) => setMentionable(d.people)).catch(() => setMentionable([]));
  }, [activeId]);

  // Polling: new messages for the open channel, plus unread badges elsewhere.
  useEffect(() => {
    const t = setInterval(() => {
      if (activeIdRef.current) loadMessages(activeIdRef.current, true);
      loadChannels();
    }, 3000);
    return () => clearInterval(t);
  }, [messages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!activeId || (!draft.trim() && !file)) return;
    setSending(true);
    // Only send ids whose @name survived any later editing of the draft.
    const mentions = mentionIds.filter((id) => {
      const p = mentionable.find((x) => x.id === id);
      return p && draft.toLowerCase().includes(`@${mentionToken(p.display_name).toLowerCase()}`);
    });
    try {
      await api(`/chat/channels/${activeId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: draft, mentions, reply_to_id: replyTo?.id ?? null, attachment: file?.data ?? null, attachment_name: file?.name ?? null }),
      });
      setDraft(""); setReplyTo(null); setFile(null);
      setMentionIds([]); setMentionQuery(null);
      await loadMessages(activeId, true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to send");
    }
    setSending(false);
  }

  function pickFile(f?: File) {
    setMessage("");
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { setMessage("Attachments must be under 1.5MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setFile({ data: String(reader.result), name: f.name });
    reader.readAsDataURL(f);
  }

  async function startDm(userId: number) {
    const res = await api<{ id: number }>("/chat/channels", { method: "POST", body: JSON.stringify({ kind: "dm", user_id: userId }) });
    setDmOpen(false);
    await loadChannels();
    setActiveId(res.id);
  }

  async function createChannel(e: FormEvent) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    try {
      const res = await api<{ id: number }>("/chat/channels", { method: "POST", body: JSON.stringify({ kind: "channel", name: newChannelName }) });
      setNewChannelOpen(false); setNewChannelName("");
      await loadChannels();
      setActiveId(res.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create channel");
    }
  }

  async function removeMessage(id: number) {
    if (!window.confirm("Delete this message?")) return;
    await api(`/chat/messages/${id}`, { method: "DELETE" });
    if (activeId) { setMessages([]); await loadMessages(activeId); }
  }

  const active = channels.find((c) => c.id === activeId) ?? null;
  const groupChannels = channels.filter((c) => c.kind === "channel");
  const dms = channels.filter((c) => c.kind === "dm");

  return (
    <section className="space-y-4">
      <PageTitle title="Chat" description="Talk to your team — channels for topics, direct messages for one-to-one." />
      {message ? <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-700">{message}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Channel + DM list */}
        <div className="card flex h-[calc(100vh-13rem)] min-h-[420px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Channels</h3>
            <button type="button" className="text-brand hover:opacity-70" title="New channel" onClick={() => setNewChannelOpen(true)}><Plus size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {groupChannels.map((c) => (
              <button key={c.id} type="button" onClick={() => setActiveId(c.id)}
                className={classNames("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition",
                  c.id === activeId ? "bg-orange-50 text-brand" : "text-stone-600 hover:bg-stone-50")}>
                <span className="truncate">#{c.name}</span>
                {c.unread > 0 ? <span className="badge bg-rose-500 text-white">{c.unread}</span> : null}
              </button>
            ))}
            <div className="mt-3 flex items-center justify-between px-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Direct messages</h3>
              <button type="button" className="text-brand hover:opacity-70" title="New message" onClick={() => setDmOpen(true)}><Plus size={16} /></button>
            </div>
            {dms.map((c) => (
              <button key={c.id} type="button" onClick={() => setActiveId(c.id)}
                className={classNames("mt-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition",
                  c.id === activeId ? "bg-orange-50 text-brand" : "text-stone-600 hover:bg-stone-50")}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="relative shrink-0">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-[10px] font-bold text-stone-600">{initialsOf(c.peer_name || "?")}</span>
                    <PresenceDot status={c.peer_presence} className="absolute -bottom-0.5 -right-0.5" />
                  </span>
                  <span className="truncate">{c.peer_name}</span>
                </span>
                {c.unread > 0 ? <span className="badge bg-rose-500 text-white">{c.unread}</span> : null}
              </button>
            ))}
            {!dms.length ? <p className="px-3 py-2 text-xs text-slate-400">No conversations yet.</p> : null}
          </div>
        </div>

        {/* Message pane */}
        <div className="card flex h-[calc(100vh-13rem)] min-h-[420px] flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            {active?.kind === "dm" ? (
              <span className="relative shrink-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-700">{initialsOf(active.peer_name || "?")}</span>
                <PresenceDot status={active.peer_presence} className="absolute -bottom-0.5 -right-0.5" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h3 className="truncate font-bold text-ink">{active ? channelLabel(active) : "Select a conversation"}</h3>
              {active?.kind === "channel" ? <p className="text-xs text-slate-500">Everyone in the team can see this channel. Use @name to notify someone.</p> : null}
              {active?.kind === "dm" ? <p className="text-xs text-slate-500">{presenceLabel(active.peer_presence)}</p> : null}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length ? messages.map((m) => {
              const mine = m.user_id === currentUserId;
              return (
                <div key={m.id} className={classNames("group flex gap-3", mine && "flex-row-reverse")}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-700">{initialsOf(m.author_name)}</span>
                  <div className={classNames("max-w-[75%] min-w-0", mine && "text-right")}>
                    <p className="text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-600">{mine ? "You" : m.author_name}</span> · {chatTime(m.created_at)}
                    </p>
                    {m.reply_to_id && !m.deleted_at ? (
                      <div className="mt-1 rounded-lg border-l-2 border-brand/40 bg-stone-50 px-2 py-1 text-left text-[11px] text-slate-500">
                        <span className="font-semibold">{m.reply_to_author}</span>: {(m.reply_to_body || "attachment").slice(0, 80)}
                      </div>
                    ) : null}
                    <div className={classNames("mt-1 inline-block rounded-2xl px-3 py-2 text-left text-sm",
                      m.deleted_at ? "bg-stone-100 italic text-slate-400" : mine ? "bg-brand text-white" : "bg-stone-100 text-ink")}>
                      {m.deleted_at ? "Message deleted" : (
                        <>
                          {m.body ? <p className="whitespace-pre-wrap break-words">{highlightMentions(m.body, people, mine)}</p> : null}
                          {m.attachment ? (
                            m.attachment.startsWith("data:image")
                              ? <img src={m.attachment} alt={m.attachment_name ?? "attachment"} className="mt-1 max-h-56 rounded-lg" />
                              : <a href={m.attachment} download={m.attachment_name ?? "file"} className="mt-1 flex items-center gap-1 underline"><Download size={14} />{m.attachment_name}</a>
                          ) : null}
                        </>
                      )}
                    </div>
                    {!m.deleted_at ? (
                      <div className={classNames("mt-1 flex gap-2 text-[11px] text-slate-400 opacity-0 transition group-hover:opacity-100", mine && "justify-end")}>
                        <button type="button" className="hover:text-brand" onClick={() => setReplyTo(m)}>Reply</button>
                        {mine ? <button type="button" className="hover:text-rose-600" onClick={() => removeMessage(m.id)}>Delete</button> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            }) : <p className="py-10 text-center text-sm text-slate-400">No messages yet — say hello.</p>}
            <div ref={endRef} />
          </div>

          {active ? (
            <form onSubmit={send} className="border-t border-line p-3">
              {replyTo ? (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-xs">
                  <span className="truncate text-slate-500">Replying to <b>{replyTo.author_name}</b>: {(replyTo.body || "attachment").slice(0, 60)}</span>
                  <button type="button" onClick={() => setReplyTo(null)}><X size={14} /></button>
                </div>
              ) : null}
              {file ? (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-orange-50 px-3 py-2 text-xs">
                  <span className="truncate text-brand">📎 {file.name}</span>
                  <button type="button" onClick={() => setFile(null)}><X size={14} /></button>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <label className="btn btn-soft cursor-pointer px-3" title="Attach a file">
                  <Plus size={16} />
                  <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => pickFile(e.target.files?.[0])} />
                </label>
                <div className="relative flex-1">
                  {/* Type "@" to pick someone — the menu inserts the exact name and
                      remembers who to notify, so a typo can't swallow the ping. */}
                  {mentionMatches.length ? (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
                      {mentionMatches.map((p, i) => (
                        <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(p); }}
                          onMouseEnter={() => setMentionIdx(i)}
                          className={classNames("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", i === mentionIdx ? "bg-orange-50 text-brand" : "text-stone-600")}>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700">{initialsOf(p.display_name)}</span>
                          <span className="truncate font-semibold">{p.display_name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    ref={draftRef}
                    className="input min-h-[44px] w-full resize-none py-2"
                    rows={1}
                    placeholder={active.kind === "dm" ? `Message ${active.peer_name} — @ to notify` : `Message #${active.name} — @ to notify`}
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                    onBlur={() => setMentionQuery(null)}
                    onKeyDown={(e) => {
                      if (mentionMatches.length) {
                        if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionMatches.length); return; }
                        if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
                        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionMatches[mentionIdx]); return; }
                        if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
                      }
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e as unknown as FormEvent); }
                    }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={sending || (!draft.trim() && !file)}>Send</button>
              </div>
            </form>
          ) : null}
        </div>
      </div>

      {newChannelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4">
          <form onSubmit={createChannel} className="card w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">New channel</h3>
            <Field label="Channel name"><input autoFocus required className="input" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="e.g. design" /></Field>
            <p className="text-xs text-slate-500">Channels are visible to everyone in the team.</p>
            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-soft" onClick={() => setNewChannelOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      )}

      {dmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Start a conversation</h3>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {people.map((p) => (
                <button key={p.id} type="button" onClick={() => startDm(p.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-stone-50">
                  <span className="relative shrink-0">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-700">{initialsOf(p.display_name)}</span>
                    <PresenceDot status={p.presence} className="absolute -bottom-0.5 -right-0.5" />
                  </span>
                  <span className="min-w-0"><span className="block truncate font-semibold text-ink">{p.display_name}</span><span className="block truncate text-xs text-slate-500">{p.role} · {presenceLabel(p.presence)}</span></span>
                </button>
              ))}
              {!people.length ? <p className="py-4 text-center text-sm text-slate-400">No other team members yet.</p> : null}
            </div>
            <div className="flex justify-end"><button type="button" className="btn btn-soft" onClick={() => setDmOpen(false)}>Close</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

type WorkSpace = { id: number; name: string; color: string; status: string; requested_by?: number | null; list_count: number; task_count: number };
type WorkList = { id: number; space_id: number; name: string; space_name: string; status: string; requested_by?: number | null; task_count: number; done_count: number };
type WorkAssignee = { user_id: number; display_name: string };
type WorkTask = {
  id: number; list_id: number; list_name: string; space_name: string; space_id: number;
  title: string; description?: string | null; status: string; priority: string;
  start_date?: string | null; due_date?: string | null; estimate_hours?: number | null;
  assignees: WorkAssignee[]; comment_count: number;
};
type WorkPerson = { id: number; display_name: string; role: string };
type WorkComment = { id: number; body: string; created_at: string; user_id: number; author_name: string };
type WorkScope = { kind: "all" | "space" | "list"; id: number };

const WORK_STATUSES = ["Backlog", "To Do", "In Progress", "In Review", "Done"];

// A colour per column, the way ClickUp tints its statuses.
const statusStyle: Record<string, string> = {
  "Backlog": "bg-slate-100 text-slate-600",
  "To Do": "bg-sky-50 text-sky-700",
  "In Progress": "bg-amber-50 text-amber-700",
  "In Review": "bg-violet-50 text-violet-700",
  "Done": "bg-emerald-50 text-emerald-700",
};

const statusBar: Record<string, string> = {
  "Backlog": "bg-slate-300",
  "To Do": "bg-sky-400",
  "In Progress": "bg-amber-400",
  "In Review": "bg-violet-400",
  "Done": "bg-emerald-400",
};

const priorityStyle: Record<string, { chip: string; bar: string }> = {
  Urgent: { chip: "bg-rose-100 text-rose-700", bar: "bg-rose-500" },
  High: { chip: "bg-orange-100 text-orange-700", bar: "bg-orange-500" },
  Normal: { chip: "bg-slate-100 text-slate-600", bar: "bg-slate-400" },
  Low: { chip: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-400" },
};

function dueTone(due?: string | null, status?: string) {
  if (!due || status === "Done") return "text-slate-400";
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
  if (diff < 0) return "text-rose-600 font-semibold";
  if (diff === 0) return "text-amber-600 font-semibold";
  return "text-slate-500";
}

function dueLabel(due?: string | null) {
  if (!due) return "No due date";
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return due;
}

function Tasks({ isAdmin }: { isAdmin: boolean }) {
  const [spaces, setSpaces] = useState<WorkSpace[]>([]);
  const [lists, setLists] = useState<WorkList[]>([]);
  const [people, setPeople] = useState<WorkPerson[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [view, setView] = useState<"board" | "list" | "calendar">("board");
  const [spaceId, setSpaceId] = useState(0);
  const [listId, setListId] = useState(0);
  const [mine, setMine] = useState(!isAdmin);
  const [message, setMessage] = useState("");
  const [openTask, setOpenTask] = useState<WorkTask | null>(null);
  const [newOpen, setNewOpen] = useState<{ status: string; listId: string } | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newListFor, setNewListFor] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ kind: "spaces" | "lists"; id: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);

  async function loadMeta() {
    const m = await api<{ spaces: WorkSpace[]; lists: WorkList[]; people: WorkPerson[] }>("/work/meta");
    setSpaces(m.spaces); setLists(m.lists); setPeople(m.people);
  }

  async function loadTasks() {
    const p = new URLSearchParams();
    if (listId) p.set("listId", String(listId));
    else if (spaceId) p.set("spaceId", String(spaceId));
    if (mine) p.set("mine", "1");
    const d = await api<{ tasks: WorkTask[] }>(`/work/tasks?${p.toString()}`);
    setTasks(d.tasks);
  }

  async function refresh() {
    try { await loadTasks(); } catch (err) { setMessage(err instanceof Error ? err.message : "Failed to load tasks"); }
  }

  useEffect(() => { loadMeta().catch(() => undefined); }, []);
  useEffect(() => { refresh(); }, [spaceId, listId, mine]);

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

  const defaultListId = listId ? String(listId)
    : spaceId ? String(activeLists.find((l) => l.space_id === spaceId)?.id ?? "")
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

  async function setStatus(task: WorkTask, status: string) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await api(`/work/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ status }) });
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not update"); }
    await refresh();
  }

  const grouped = useMemo(() => {
    const map: Record<string, WorkTask[]> = {};
    for (const s of WORK_STATUSES) map[s] = [];
    for (const t of tasks) (map[t.status] ??= []).push(t);
    return map;
  }, [tasks]);

  const done = tasks.filter((t) => t.status === "Done").length;
  const overdue = tasks.filter((t) => t.due_date && t.status !== "Done" && Date.parse(t.due_date) < Date.parse(today)).length;

  const pill = (active: boolean) => classNames(
    "flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
    active ? "border-brand bg-orange-50 text-brand" : "border-line bg-white text-stone-600 hover:border-stone-300",
  );

  const nameInput = (
    <input autoFocus className="input h-7 w-40 py-0 text-xs" value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commitEdit} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(null); }} />
  );

  return (
    <section className="space-y-4">
      <PageTitle
        title="Work"
        description={isAdmin ? "Spaces hold your brand lists. Every task lives in a list." : "Your work, and anything raised for you."}
        action={(
          <button type="button" className="btn btn-primary" onClick={() => setNewOpen({ status: "To Do", listId: defaultListId })}>
            <Plus size={16} />New task
          </button>
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
        <div className="flex flex-wrap items-center gap-2 p-3">
          <span className="w-12 text-[10px] font-bold uppercase tracking-wider text-slate-400">Spaces</span>
          <button type="button" className={pill(!spaceId)} onClick={() => { setSpaceId(0); setListId(0); }}>All</button>
          {activeSpaces.map((s) => (editing?.kind === "spaces" && editing.id === s.id ? (
            <span key={s.id}>{nameInput}</span>
          ) : (
            <span key={s.id} className={pill(spaceId === s.id)}>
              <button type="button" onClick={() => { setSpaceId(s.id); setListId(0); }}>{s.name}</button>
              {isAdmin && spaceId === s.id ? (
                <>
                  <button type="button" aria-label="Rename space" className="text-slate-400 hover:text-ink" onClick={() => startEdit("spaces", s.id, s.name)}><Pencil size={11} /></button>
                  <button type="button" aria-label="Delete space" className="text-slate-400 hover:text-rose-600"
                    onClick={() => remove("spaces", s.id, `Delete the space "${s.name}"? This also deletes ${s.list_count} list(s) and ${s.task_count} task(s).`)}>
                    <Trash2 size={11} />
                  </button>
                </>
              ) : null}
            </span>
          )))}
          <button type="button" onClick={() => setNewSpaceOpen(true)}
            className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-400 transition hover:text-brand">
            <Plus size={13} />{isAdmin ? "Space" : "Request space"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-3">
          <span className="w-12 text-[10px] font-bold uppercase tracking-wider text-slate-400">Lists</span>
          <button type="button" className={pill(!listId)} onClick={() => setListId(0)}>All</button>
          {visibleLists.map((l) => (editing?.kind === "lists" && editing.id === l.id ? (
            <span key={l.id}>{nameInput}</span>
          ) : (
            <span key={l.id} className={pill(listId === l.id)}>
              <button type="button" onClick={() => { setListId(l.id); setSpaceId(l.space_id); }}>{l.name}</button>
              {l.task_count ? <span className="text-[10px] text-slate-400">{l.task_count}</span> : null}
              {isAdmin && listId === l.id ? (
                <>
                  <button type="button" aria-label="Rename list" className="text-slate-400 hover:text-ink" onClick={() => startEdit("lists", l.id, l.name)}><Pencil size={11} /></button>
                  <button type="button" aria-label="Delete list" className="text-slate-400 hover:text-rose-600"
                    onClick={() => remove("lists", l.id, `Delete the list "${l.name}"? This also deletes its ${l.task_count} task(s).`)}>
                    <Trash2 size={11} />
                  </button>
                </>
              ) : null}
            </span>
          )))}
          {!visibleLists.length ? <span className="text-xs text-slate-400">No lists in this space yet.</span> : null}
          <button type="button" onClick={() => setNewListFor(spaceId || activeSpaces[0]?.id || 0)}
            className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-400 transition hover:text-brand">
            <Plus size={13} />{isAdmin ? "List" : "Request list"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{scopeLabel}</p>
            <p className="text-xs text-slate-400">
              {tasks.length - done} open{done ? ` · ${done} done` : ""}{overdue ? ` · ${overdue} overdue` : ""}
            </p>
          </div>
          {isAdmin ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-stone-600">
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
              My tasks
            </label>
          ) : null}
          <div className="ml-auto flex gap-1 rounded-full bg-stone-100 p-1">
            {(["board", "list", "calendar"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={classNames("rounded-full px-3 py-1 text-xs font-semibold capitalize transition",
                  view === v ? "bg-white text-ink shadow-sm" : "text-stone-500 hover:text-ink")}>
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
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { const t = tasks.find((x) => x.id === dragId); if (t && t.status !== status) setStatus(t, status); setDragId(null); }}
              className="flex w-[240px] shrink-0 grow flex-col rounded-2xl bg-stone-50/80 p-2">
              <div className="flex items-center gap-2 px-1 pb-2">
                <span className={classNames("h-1.5 w-1.5 rounded-full", statusBar[status])} />
                <span className="text-xs font-bold uppercase tracking-wide text-stone-500">{status}</span>
                <span className="ml-auto text-xs text-slate-400">{grouped[status]?.length ?? 0}</span>
              </div>
              <div className="flex-1 space-y-2">
                {(grouped[status] ?? []).map((t) => (
                  <button key={t.id} type="button" draggable onDragStart={() => setDragId(t.id)} onClick={() => setOpenTask(t)}
                    className="w-full rounded-xl border border-line bg-white p-3 text-left transition hover:border-stone-300 hover:shadow-sm">
                    <p className="text-sm font-semibold leading-snug text-ink">{t.title}</p>
                    {!listId ? <p className="mt-1 truncate text-[11px] text-slate-400">{t.list_name}</p> : null}
                    <div className="mt-2 flex items-center gap-2">
                      <span className={classNames("h-1.5 w-1.5 shrink-0 rounded-full", priorityStyle[t.priority]?.bar)} title={t.priority} />
                      <span className={classNames("truncate text-[11px]", dueTone(t.due_date, t.status))}>{dueLabel(t.due_date)}</span>
                      {t.comment_count ? <span className="text-[11px] text-slate-400">💬 {t.comment_count}</span> : null}
                      <span className="ml-auto flex -space-x-1">
                        {t.assignees.slice(0, 3).map((a) => (
                          <span key={a.user_id} title={a.display_name} className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700 ring-1 ring-white">
                            {initialsOf(a.display_name)}
                          </span>
                        ))}
                      </span>
                    </div>
                  </button>
                ))}
                <button type="button" onClick={() => setNewOpen({ status, listId: defaultListId })}
                  className="flex w-full items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white hover:text-brand">
                  <Plus size={13} />Task
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Task</th>
                  <th className="px-4 py-3 font-bold">List</th>
                  <th className="px-4 py-3 font-bold">Assignees</th>
                  <th className="px-4 py-3 font-bold">Due</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tasks.length ? tasks.map((t) => (
                  <tr key={t.id} className="cursor-pointer bg-white hover:bg-stone-50" onClick={() => setOpenTask(t)}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className={classNames("h-1.5 w-1.5 shrink-0 rounded-full", priorityStyle[t.priority]?.bar)} title={t.priority} />
                        <span className="font-semibold text-ink">{t.title}</span>
                        {t.comment_count ? <span className="text-[11px] text-slate-400">💬 {t.comment_count}</span> : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{t.list_name}</td>
                    <td className="px-4 py-3">
                      <span className="flex -space-x-1">
                        {t.assignees.map((a) => (
                          <span key={a.user_id} title={a.display_name} className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700 ring-1 ring-white">{initialsOf(a.display_name)}</span>
                        ))}
                        {!t.assignees.length ? <span className="text-xs text-slate-400">—</span> : null}
                      </span>
                    </td>
                    <td className={classNames("px-4 py-3 text-xs", dueTone(t.due_date, t.status))}>{dueLabel(t.due_date)}</td>
                    <td className="px-4 py-3">
                      <select className={classNames("input h-8 w-auto py-0 text-xs font-semibold", statusStyle[t.status])}
                        value={t.status} onClick={(e) => e.stopPropagation()} onChange={(e) => setStatus(t, e.target.value)}>
                        {WORK_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                )) : <tr><td className="px-4 py-10 text-center text-slate-500" colSpan={5}>Nothing here yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {view === "calendar" ? <WorkCalendar tasks={tasks} onOpen={setOpenTask} /> : null}

      {openTask ? (
        <WorkTaskModal task={openTask} isAdmin={isAdmin} people={people} spaces={activeSpaces} lists={activeLists}
          onClose={() => setOpenTask(null)} onChanged={async () => { await refresh(); setOpenTask(null); }} />
      ) : null}

      {newOpen ? (
        <WorkTaskForm spaces={activeSpaces} lists={activeLists} people={people} initial={newOpen} onClose={() => setNewOpen(null)}
          onSaved={async () => { setNewOpen(null); await refresh(); await loadMeta(); }} />
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
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const list = byDay[day] ?? [];
          return (
            <div key={day} className={classNames("min-h-[86px] rounded-lg border p-1", day === today ? "border-brand bg-orange-50/40" : "border-line")}>
              <p className="px-1 text-[11px] font-bold text-slate-500">{i + 1}</p>
              <div className="space-y-1">
                {list.slice(0, 3).map((t) => (
                  <button key={t.id} type="button" onClick={() => onOpen(t)}
                    className={classNames("block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold", statusStyle[t.status])}>
                    {t.title}
                  </button>
                ))}
                {list.length > 3 ? <p className="px-1 text-[10px] text-slate-400">+{list.length - 3} more</p> : null}
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
    due_date: task.due_date ?? "", list_id: String(task.list_id),
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm">
      <div className="card my-8 w-full max-w-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{task.space_name} › {task.list_name}</p>
            {isAdmin
              ? <input className="input mt-1 text-lg font-bold" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              : <h3 className="mt-1 text-lg font-bold text-ink">{task.title}</h3>}
          </div>
          <button type="button" aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-stone-100" onClick={onClose}><X size={20} /></button>
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
            <input className="input" type="date" value={form.due_date} disabled={!isAdmin} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
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
            : <p className="rounded-xl border border-line p-3 text-sm text-slate-600">{task.description || "No description."}</p>}
        </div>

        <div className="mt-4">
          <p className="label">Assignees</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = form.assignees.includes(p.id);
              return (
                <button key={p.id} type="button" disabled={!isAdmin} onClick={() => toggleAssignee(p.id)}
                  className={classNames("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
                    on ? "border-brand bg-orange-50 text-brand" : "border-line bg-white text-stone-500", !isAdmin && "cursor-default")}>
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
                  <p className="text-[11px] text-slate-400"><span className="font-semibold text-slate-600">{c.author_name}</span> · {chatTime(c.created_at)}</p>
                  <p className="whitespace-pre-wrap text-sm text-ink">{c.body}</p>
                </div>
              </div>
            )) : <p className="text-sm text-slate-400">No comments yet.</p>}
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

function WorkTaskForm({ spaces, lists, people, initial, onClose, onSaved }: {
  spaces: WorkSpace[]; lists: WorkList[]; people: WorkPerson[]; initial: { status: string; listId: string };
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    list_id: initial.listId, title: "", description: "",
    priority: "Normal", status: initial.status, due_date: "", assignees: [] as number[],
  });
  // Pick the space first, then only its lists are offered.
  const [spaceId, setSpaceId] = useState(
    lists.find((l) => String(l.id) === initial.listId)?.space_id ?? spaces[0]?.id ?? 0,
  );
  const formLists = lists.filter((l) => l.space_id === spaceId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Every task must sit under a brand list.
    if (!form.list_id) { setError("Pick the list this task belongs to."); return; }
    setBusy(true); setError("");
    try {
      await api("/work/tasks", { method: "POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="card my-8 w-full max-w-lg space-y-4 p-6">
        <h3 className="text-lg font-bold text-ink">New task</h3>
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
        <Field label="Title"><input required autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Design August reels" /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Status">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {WORK_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {["Urgent", "High", "Normal", "Low"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Due"><input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        </div>
        <div>
          <p className="label">Assign to</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = form.assignees.includes(p.id);
              return (
                <button key={p.id} type="button"
                  onClick={() => setForm((f) => ({ ...f, assignees: on ? f.assignees.filter((x) => x !== p.id) : [...f.assignees, p.id] }))}
                  className={classNames("rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-brand bg-orange-50 text-brand" : "border-line text-stone-500")}>
                  {p.display_name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create task"}</button>
        </div>
      </form>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6">
        <h3 className="text-lg font-bold text-ink">{isAdmin ? "New space" : "Request a space"}</h3>
        <p className="text-xs text-slate-500">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6">
        <h3 className="text-lg font-bold text-ink">{isAdmin ? "New list" : "Request a list"}</h3>
        <p className="text-xs text-slate-500">
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

function Leave({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  async function load() {
    const data = await api<{ leaves: LeaveRequest[]; leaveTypes: LeaveType[] }>("/leaves");
    setRows(data.leaves);
    setLeaveTypes(data.leaveTypes);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/leaves", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
    event.currentTarget.reset();
    await load();
  }

  async function decide(id: number, status: "Approved" | "Rejected") {
    const admin_note = window.prompt(`${status} note`) ?? "";
    await api(`/leaves/${id}/decision`, { method: "POST", body: JSON.stringify({ status, admin_note }) });
    await load();
  }

  async function saveType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await api("/leave-types", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
    form.reset();
    await load();
  }

  async function removeType(id: number) {
    if (!window.confirm("Delete this leave type?")) return;
    await api(`/leave-types/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="space-y-5">
      <PageTitle title="Leave Management" description={isAdmin ? "Approve, reject, and review leave requests." : "Apply and track your leave history."} />
      {isAdmin ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <form onSubmit={saveType} className="card grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Leave type"><input required name="name" className="input" placeholder="Paid Leave" /></Field>
            <Field label="Paid">
              <select name="is_paid" className="input" defaultValue="1">
                <option value="1">Paid</option>
                <option value="0">Unpaid</option>
              </select>
            </Field>
            <Field label="Monthly balance"><input name="monthly_balance" className="input" type="number" step="0.5" defaultValue="1" /></Field>
            <Field label="Yearly balance"><input name="yearly_balance" className="input" type="number" step="0.5" defaultValue="12" /></Field>
            <button className="btn btn-primary sm:col-span-2"><Plus size={17} />Save leave type</button>
          </form>
          <div className="card p-4">
            <h3 className="font-bold text-ink">Leave Types</h3>
            <div className="mt-3 divide-y divide-line">
              {leaveTypes.map((type) => (
                <div key={type.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-ink">{type.name}</p>
                    <p className="text-xs text-slate-500">{type.is_paid ? "Paid" : "Unpaid"} · {type.monthly_balance}/month · {type.yearly_balance}/year</p>
                  </div>
                  <button className="btn btn-soft" onClick={() => removeType(type.id)}>Delete</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {!isAdmin ? (
        <form onSubmit={apply} className="card grid gap-3 p-4 md:grid-cols-5">
          <Field label="Leave type"><select name="leave_type_id" className="input">{leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field>
          <Field label="Start"><input name="start_date" className="input" type="date" defaultValue={today} /></Field>
          <Field label="End"><input name="end_date" className="input" type="date" defaultValue={today} /></Field>
          <Field label="Reason"><input name="reason" className="input" placeholder="Reason" /></Field>
          <button className="btn btn-primary self-end">Apply</button>
        </form>
      ) : null}
      <DataTable
        title="Leave Requests"
        rows={rows}
        columns={[
          ["Employee", (row) => row.employee_name ?? "You"],
          ["Type", (row) => row.leave_type_name ?? "-"],
          ["Dates", (row) => `${row.start_date} to ${row.end_date}`],
          ["Days", (row) => row.days],
          ["Status", (row) => <Badge value={row.status} />],
          [
            "Action",
            (row) =>
              isAdmin && row.status === "Pending" ? (
                <div className="flex gap-2">
                  <button className="btn btn-soft" onClick={() => decide(row.id, "Approved")}>Approve</button>
                  <button className="btn btn-soft" onClick={() => decide(row.id, "Rejected")}>Reject</button>
                </div>
              ) : (
                row.admin_note ?? "-"
              ),
          ],
        ]}
      />
    </section>
  );
}

function Payroll({ isAdmin }: { isAdmin: boolean }) {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [month, setMonth] = useState(lastMonth.getMonth() + 1); // Custom-view month
  const [year, setYear] = useState(lastMonth.getFullYear());
  const [period, setPeriod] = useState("Last Month");
  // Separate month/year for generating payroll (defaults to last completed month).
  const [genMonth, setGenMonth] = useState(lastMonth.getMonth() + 1);
  const [genYear, setGenYear] = useState(lastMonth.getFullYear());
  const [rows, setRows] = useState<Salary[]>([]);
  const [editingSalary, setEditingSalary] = useState<Salary | null>(null);
  const [payModalOpen, setPayModalOpen] = useState<{ id: number; employee: string } | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [breakdownEmployees, setBreakdownEmployees] = useState<Employee[]>([]);
  const [breakdownEmployeeId, setBreakdownEmployeeId] = useState("");

  // A month is generatable only if it's strictly before the current month.
  const curIndex = now.getFullYear() * 12 + (now.getMonth() + 1);
  const genIsPast = genYear * 12 + genMonth < curIndex;

  useEffect(() => {
    if (!isAdmin) return;
    api<{ employees: Employee[] }>("/employees")
      .then((d) => { setBreakdownEmployees(d.employees); setBreakdownEmployeeId(String(d.employees[0]?.id ?? "")); })
      .catch(() => undefined);
  }, [isAdmin]);
  const [editForm, setEditForm] = useState({
    working_days: 0,
    paid_days: 0,
    gross_salary: 0,
    deductions: 0,
    net_salary: 0,
  });

  async function processPaymentProof(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800; const MAX_HEIGHT = 800;
          let width = img.width; let height = img.height;
          if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
          else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  }

  async function markPaidSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payModalOpen) return;
    setPayBusy(true);
    try {
      let base64 = "";
      if (paymentProofFile) base64 = await processPaymentProof(paymentProofFile);
      await api(`/payroll/${payModalOpen.id}`, { method: "PUT", body: JSON.stringify({ status: "Paid", payment_proof: base64 || null }) });
      setPayModalOpen(null); setPaymentProofFile(null); await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setPayBusy(false);
    }
  }

  async function setPaid(id: number, isPaid: boolean) {
    await api(`/payroll/${id}`, { method: "PUT", body: JSON.stringify({ status: isPaid ? "Paid" : "Unpaid" }) });
    await load();
  }

  async function deleteProof(id: number) {
    if (!window.confirm("Delete the uploaded payment screenshot?")) return;
    await api(`/payroll/${id}`, { method: "PUT", body: JSON.stringify({ payment_proof: "" }) });
    await load();
  }

  async function load() {
    const params = new URLSearchParams({ period, month: String(month), year: String(year) });
    const data = await api<{ salaries: Salary[] }>(`/payroll?${params.toString()}`);
    setRows(data.salaries);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function generate() {
    setMessage("");
    if (!genIsPast) { setMessage("Payroll can only be generated for completed (past) months."); return; }
    try {
      await api("/payroll/generate", { method: "POST", body: JSON.stringify({ month: genMonth, year: genYear }) });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to generate payroll");
    }
  }

  function handleEditClick(salary: Salary) {
    setEditingSalary(salary);
    setEditForm({
      working_days: salary.working_days,
      paid_days: salary.paid_days,
      gross_salary: salary.gross_salary,
      deductions: salary.deductions,
      net_salary: salary.net_salary,
    });
  }

  function handleFormChange(field: string, val: number) {
    setEditForm((prev) => {
      const next = { ...prev, [field]: val };
      if (field === "gross_salary" || field === "deductions") {
        next.net_salary = Math.max(0, next.gross_salary - next.deductions);
      }
      return next;
    });
  }

  async function saveOverride(e: FormEvent) {
    e.preventDefault();
    if (!editingSalary) return;
    try {
      await api(`/payroll/${editingSalary.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      setEditingSalary(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save salary details");
    }
  }

  return (
    <section className="space-y-5">
      <PageTitle title="Salary & Payroll" description={isAdmin ? "Generate salary for completed months, mark it paid, and issue payslips." : "Your salary history. Payslip PDF is available once your salary is marked paid."} />
      {message ? <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-700">{message}</div> : null}

      {/* View controls — defaults to the last 6 months */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Show">
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="Last Month">Last Month</option>
            <option value="Last 3 Months">Last 3 Months</option>
            <option value="Last 6 Months">Last 6 Months</option>
            <option value="Last 12 Months">Last 12 Months</option>
            <option value="Custom">Specific Month</option>
          </select>
        </Field>
        {period === "Custom" && (
          <>
            <Field label="Month">
              <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Year"><input className="input" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>
          </>
        )}
        <button type="button" className="btn btn-soft" onClick={load}><RefreshCcw size={17} />Apply</button>
      </div>

      {/* Admin-only: generate payroll for a completed (past) month */}
      {isAdmin && (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <Field label="Generate for month">
            <select className="input" value={genMonth} onChange={(e) => setGenMonth(Number(e.target.value))}>
              {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="Year"><input className="input" type="number" value={genYear} onChange={(e) => setGenYear(Number(e.target.value))} /></Field>
          <button type="button" className="btn btn-primary" onClick={generate} disabled={!genIsPast} title={genIsPast ? "" : "Only completed (past) months can be generated"}>
            <Banknote size={17} />Generate payroll
          </button>
          {!genIsPast ? <p className="self-center text-xs font-semibold text-amber-600">Current & future months are locked.</p> : null}
        </div>
      )}

      {/* Salary day breakdown lives here (admin only) — Attendance stays attendance-only. */}
      {/* Day-by-day salary breakdown — admin picks the employee, an employee sees their own. */}
      <div className={classNames("card grid gap-3 p-4", isAdmin ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {isAdmin ? (
          <Field label="Breakdown for employee">
            <select className="input" value={breakdownEmployeeId} onChange={(e) => setBreakdownEmployeeId(e.target.value)}>
              {breakdownEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Month">
          <select className="input" value={genMonth} onChange={(e) => setGenMonth(Number(e.target.value))}>
            {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Field>
        <Field label="Year"><input className="input" type="number" value={genYear} onChange={(e) => setGenYear(Number(e.target.value))} /></Field>
      </div>
      <MonthGrid isAdmin={isAdmin} showSalary month={genMonth} year={genYear} employeeId={isAdmin ? breakdownEmployeeId : undefined} />

      <DataTable
        title="Salary Records"
        rows={rows}
        columns={[
          ["Employee", (row) => row.employee_name ?? row.employee_code],
          ["Period", (row) => `${monthNames[row.salary_month - 1]} ${row.salary_year}`],
          ["Days", (row) => <span className="text-xs text-slate-600">{row.paid_days} / {row.working_days} paid</span>],
          ["Gross", (row) => currency.format(row.gross_salary)],
          ["Deductions", (row) => row.deductions > 0
            ? <span className="font-semibold text-rose-600">-{currency.format(row.deductions)}</span>
            : <span className="text-slate-400">—</span>],
          ["Net", (row) => <span className="font-bold text-ink">{currency.format(row.net_salary)}</span>],
          ["Status", (row) => <Badge value={row.status === "Done" ? "Paid" : "Unpaid"} />],
          [
            "Action",
            (row) => (
              <div className="flex gap-2">
                <a className="btn btn-soft" href={`/api/salary-slips/${row.id}`} target="_blank" rel="noreferrer" title="Download Slip"><Download size={17} /></a>
                {row.payment_proof && (
                  <a className="btn btn-soft" href={row.payment_proof} download={`payment_proof_${row.employee_name}_${row.salary_month}.jpg`} title="Payment Proof">
                    <ImageIcon size={17} /><span className="hidden sm:inline">Proof</span>
                  </a>
                )}
                {isAdmin && (
                  <>
                    {row.payment_proof && <button type="button" className="btn btn-soft" onClick={() => deleteProof(row.id)} title="Delete payment screenshot"><X size={16} /></button>}
                    <button type="button" className="btn btn-soft" onClick={() => handleEditClick(row)}>Edit</button>
                    {row.status !== "Done" ? (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => setPaid(row.id, true)}>Mark paid</button>
                        <button type="button" className="btn btn-soft" title="Mark paid with a payment screenshot" onClick={() => setPayModalOpen({ id: row.id, employee: row.employee_name || "Employee" })}><ImageIcon size={16} /></button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-soft" onClick={() => setPaid(row.id, false)}>Mark unpaid</button>
                    )}
                  </>
                )}
              </div>
            ),
          ],
        ]}
      />

      {payModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 animate-fade-in">
          <form onSubmit={markPaidSubmit} className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Mark as Paid</h3>
            <p className="text-xs text-slate-500">Upload a payment screenshot for {payModalOpen.employee}.</p>
            <Field label="Payment Screenshot (Optional)">
              <input type="file" className="input file:mr-4 file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100" accept="image/*" onChange={(e) => setPaymentProofFile(e.target.files?.[0] || null)} />
            </Field>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn btn-soft" onClick={() => setPayModalOpen(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={payBusy}>{payBusy ? "Saving..." : "Confirm Payment"}</button>
            </div>
          </form>
        </div>
      )}

      {editingSalary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 animate-fade-in">
          <form onSubmit={saveOverride} className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">Edit Salary Details</h3>
            <p className="text-xs text-slate-500">Modify attendance days, gross salary, or add custom deductions for {editingSalary.employee_name}.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Working Days">
                <input className="input" type="number" step="any" value={editForm.working_days} onChange={(e) => handleFormChange("working_days", Number(e.target.value))} />
              </Field>
              <Field label="Paid Days">
                <input className="input" type="number" step="any" value={editForm.paid_days} onChange={(e) => handleFormChange("paid_days", Number(e.target.value))} />
              </Field>
            </div>
            <Field label="Gross Salary">
              <input className="input" type="number" step="any" value={editForm.gross_salary} onChange={(e) => handleFormChange("gross_salary", Number(e.target.value))} />
            </Field>
            <Field label="Deductions (Custom)">
              <input className="input" type="number" step="any" value={editForm.deductions} onChange={(e) => handleFormChange("deductions", Number(e.target.value))} />
            </Field>
            <Field label="Net Payable Salary">
              <input className="input" type="number" step="any" value={editForm.net_salary} onChange={(e) => handleFormChange("net_salary", Number(e.target.value))} />
            </Field>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" className="btn btn-soft" onClick={() => setEditingSalary(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      )}
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
    <section className="space-y-5">
      <PageTitle title="Holidays" description={isAdmin ? "Manage company holidays for everyone." : "View upcoming company holidays."} />
      {message ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">{message}</div> : null}
      {isAdmin ? (
        <form onSubmit={save} className="card grid gap-3 p-4 md:grid-cols-4">
          <Field label="Holiday name"><input required name="name" className="input" placeholder="Holiday name" /></Field>
          <Field label="Date"><input required name="holiday_date" className="input" type="date" defaultValue={today} /></Field>
          <Field label="Description"><input name="description" className="input" placeholder="Optional note" /></Field>
          <button className="btn btn-primary self-end"><Plus size={17} />Add</button>
        </form>
      ) : null}
      <DataTable
        title="Holiday List"
        rows={rows}
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

function Reports() {
  const [meta, setMeta] = useState<{ employees: Employee[]; departments: Department[] }>({ employees: [], departments: [] });
  const [filters, setFilters] = useState({ employeeId: "", departmentId: "", start: today.slice(0, 8) + "01", end: today, month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });

  useEffect(() => {
    api<{ employees: Employee[]; departments: Department[] }>("/reports/meta")
      .then(setMeta)
      .catch(console.error);
  }, []);

  const common = new URLSearchParams({ employeeId: filters.employeeId, departmentId: filters.departmentId, start: filters.start, end: filters.end }).toString();
  const month = new URLSearchParams({ employeeId: filters.employeeId, departmentId: filters.departmentId, month: filters.month, year: filters.year }).toString();

  return (
    <section className="space-y-5">
      <PageTitle title="Reports" description="Export simple attendance, leave, and salary reports as CSV." />
      <div className="card grid gap-3 p-4 md:grid-cols-5">
        <Field label="Employee">
          <select className="input" value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}>
            <option value="">All employees</option>
            {meta.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <select className="input" value={filters.departmentId} onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}>
            <option value="">All departments</option>
            {meta.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
        </Field>
        <Field label="Start"><input className="input" type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></Field>
        <Field label="End"><input className="input" type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Month"><input className="input" type="number" min={1} max={12} value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} /></Field>
          <Field label="Year"><input className="input" type="number" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} /></Field>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ReportCard title="Attendance report" href={`/api/attendance.csv?${common}`} />
        <ReportCard title="Leave report" href={`/api/reports/leaves.csv?${common}`} />
        <ReportCard title="Salary report" href={`/api/reports/salaries.csv?${month}`} />
      </div>
    </section>
  );
}

function ReportCard({ title, href }: { title: string; href: string }) {
  return (
    <div className="card p-4">
      <h3 className="font-bold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">Download a filtered CSV for admin review.</p>
      <a className="btn btn-primary mt-4 w-full" href={href}><Download size={17} />Export CSV</a>
    </div>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<{ settings: CompanySettings }>("/settings")
      .then((data) => setSettings(data.settings))
      .catch((err) => setMessage(err.message));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const data = await api<{ settings: CompanySettings }>("/settings", { method: "PUT", body: JSON.stringify(body) });
      setSettings(data.settings);
      setMessage("Settings saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save settings");
    }
  }

  if (!settings) return <EmptyState title={message || "Loading settings..."} />;

  return (
    <section className="space-y-5">
      <PageTitle title="Company Settings" description="Configure company details, office timing, attendance rules, and salary deductions." />
      {message ? <div className="rounded-md bg-sky-50 px-3 py-2 text-sm font-semibold text-brand">{message}</div> : null}
      <form onSubmit={save} className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Company name"><input required name="company_name" className="input" defaultValue={settings.company_name} /></Field>
        <Field label="Logo URL"><input name="company_logo_url" className="input" defaultValue={settings.company_logo_url || ""} /></Field>
        <Field label="Working days"><input name="working_days" className="input" defaultValue={settings.working_days} /></Field>
        <Field label="Office start"><input required name="office_start_time" type="time" className="input" defaultValue={settings.office_start_time} /></Field>
        <Field label="Office end"><input required name="office_end_time" type="time" className="input" defaultValue={settings.office_end_time} /></Field>
        <Field label="Late mark time"><input required name="late_mark_time" type="time" className="input" defaultValue={settings.late_mark_time} /></Field>
        <Field label="Half-day min hours"><input required name="half_day_min_hours" type="number" step="0.5" min="0" className="input" defaultValue={settings.half_day_min_hours} /></Field>
        <Field label="Shift min hours"><input required name="shift_min_hours" type="number" step="0.5" min="0" className="input" defaultValue={settings.shift_min_hours} /></Field>
        <Field label="Deduct absent days">
          <select name="deduct_absent_days" className="input" defaultValue={String(settings.deduct_absent_days)}>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </Field>
        <Field label="Company address"><textarea name="company_address" className="input min-h-24" defaultValue={settings.company_address || ""} /></Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <button className="btn btn-primary"><Settings size={17} />Save settings</button>
        </div>
      </form>
    </section>
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
    <section className="space-y-5">
      <PageTitle title="Audit Logs" description="Track important admin actions in one place." />
      <DataTable
        title="Recent Activity"
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
