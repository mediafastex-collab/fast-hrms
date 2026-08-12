import {
  Banknote,
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
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "Superadmin" | "Employee";
type View =
  | "dashboard"
  | "employees"
  | "departments"
  | "attendance"
  | "tasks"
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
  const nav = [
    { id: "dashboard" as View, label: "Dashboard", icon: LayoutDashboard, show: true },
    { id: "employees" as View, label: "Employees", icon: UsersRound, show: isAdmin },
    { id: "departments" as View, label: "Departments", icon: Building2, show: isAdmin },
    { id: "attendance" as View, label: "Attendance", icon: CalendarCheck, show: true },
    { id: "tasks" as View, label: "Tasks", icon: ClipboardList, show: true },
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
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-line bg-white p-4 lg:block">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="rounded-md bg-brand p-2 text-white">
            <BriefcaseBusiness size={20} />
          </div>
          <div>
            <p className="font-bold text-ink">Fast HRMS</p>
            <p className="text-xs text-slate-500">{user.role}</p>
          </div>
        </div>
        <nav className="mt-6 space-y-1">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => choose(item.id)}
              className={classNames(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition",
                view === item.id ? "bg-sky-50 text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-ink",
              )}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Welcome</p>
              <h2 className="text-lg font-bold text-ink">{user.employeeName ?? user.email}</h2>
            </div>
            <div className="flex items-center gap-2">
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

        <main className="mx-auto max-w-7xl px-4 py-6">
          {view === "dashboard" ? user.role === "Superadmin" ? <AdminDashboard /> : <EmployeeDashboard /> : null}
          {view === "employees" && isAdmin ? <Employees /> : null}
          {view === "departments" && isAdmin ? <Departments /> : null}
          {view === "attendance" ? <Attendance isAdmin={isAdmin} /> : null}
          {view === "tasks" ? <Tasks isAdmin={isAdmin} /> : null}
          {view === "leave" ? <Leave isAdmin={isAdmin} /> : null}
          {view === "payroll" ? <Payroll isAdmin={isAdmin} /> : null}
          {view === "holidays" ? <Holidays isAdmin={isAdmin} /> : null}
          {view === "reports" && isAdmin ? <Reports /> : null}
          {view === "settings" && isAdmin ? <SettingsPage /> : null}
          {view === "audit" && isAdmin ? <AuditLogs /> : null}
          {view === "profile" && !isAdmin ? <Profile /> : null}
        </main>
      </div>
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
      <PageTitle title="Superadmin Dashboard" description="Company-wide attendance, leave, and payroll snapshot." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UsersRound} label="Total employees" value={summary.totalEmployees} />
        <StatCard icon={CalendarCheck} label="Present today" value={summary.presentToday} />
        <StatCard icon={Clock3} label="Absent today" value={summary.absentToday} />
        <StatCard icon={FileText} label="Pending leave requests" value={summary.pendingLeaveRequests} />
        <StatCard icon={CheckCircle2} label="Approved leaves this month" value={summary.approvedLeavesThisMonth} />
        <StatCard icon={Banknote} label="Pending salaries" value={summary.pendingSalaries} />
        <StatCard icon={CheckCircle2} label="Salary done count" value={summary.salaryDoneCount} />
        <StatCard icon={Banknote} label="Estimated monthly payroll" value={currency.format(summary.estimatedMonthlyPayroll)} />
      </div>
    </section>
  );
}

const QUOTES = [
  "The only way to do great work is to love what you do. — Steve Jobs",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. — Winston Churchill",
  "Believe you can and you're halfway there. — Theodore Roosevelt",
  "It always seems impossible until it's done. — Nelson Mandela",
  "Your time is limited, don't waste it living someone else's life. — Steve Jobs",
  "I find that the harder I work, the more luck I seem to have. — Thomas Jefferson",
  "Don't watch the clock; do what it does. Keep going. — Sam Levenson",
  "The future depends on what you do today. — Mahatma Gandhi",
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
    const attData = await api<{ attendance: AttendanceRecord[] }>("/attendance");
    setSummary(data.summary);
    setSettings(settingsData.settings);
    setAttendance(attData.attendance);
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
      <div className="card border-l-4 border-l-brand p-6 bg-white">
        <p className="text-lg font-medium text-ink italic">"{quote}"</p>
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
      <PageTitle title="Employee Dashboard" description="Your attendance, leave, and salary at a glance." />
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
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={FileText} label="Leave balance" value={summary.leaveBalance} sub="Paid leave estimate" />
        <StatCard icon={Banknote} label="Salary status" value={summary.currentSalary?.status ?? "Pending"} sub="Current month" />
        <div className="card p-4">
          <p className="text-sm font-medium text-slate-500">Latest salary slip</p>
          {summary.latestSalary ? (
            <a className="btn btn-soft mt-4 w-full" href={`/api/salary-slips/${summary.latestSalary.id}`} target="_blank" rel="noreferrer">
              <Download size={17} />
              Download
            </a>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No salary slip yet.</p>
          )}
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
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-amber-50 p-2 text-amber-600"><Sparkles size={18} /></span>
            <h3 className="font-bold text-ink">Upcoming holidays</h3>
          </div>
          <div className="mt-4 space-y-2">
            {summary.upcomingHolidays && summary.upcomingHolidays.length ? summary.upcomingHolidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">{holiday.name}</p>
                  {holiday.description ? <p className="text-xs text-slate-500">{holiday.description}</p> : null}
                </div>
                <span className="text-sm font-semibold text-amber-600">{holiday.holiday_date}</span>
              </div>
            )) : <p className="text-sm text-slate-500">No upcoming holidays.</p>}
          </div>
        </div>
      </div>
      <DataTable
        title="My Daily Work & Duration Log"
        rows={attendance}
        columns={[
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
          ["Worked", (row) => workedHMS(row)],
          ["Status", (row) => <Badge value={row.status} />],
        ]}
      />
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

function Attendance({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filters, setFilters] = useState({ employeeId: "", start: today.slice(0, 8) + "01", end: today });
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

  async function load() {
    const search = new URLSearchParams(filters).toString();
    const data = await api<{ attendance: AttendanceRecord[]; employees?: Employee[] }>(`/attendance?${search}`);
    setRows(data.attendance);
    setEmployees(data.employees ?? []);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

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
        description={isAdmin ? "Filter, manually mark, edit, and export company attendance." : "View your own attendance history."}
        action={isAdmin ? <a className="btn btn-soft" href={`/api/attendance.csv?${new URLSearchParams(filters).toString()}`}><Download size={17} />CSV</a> : null}
      />
      {isAdmin ? (
        <div className="card grid gap-3 p-4 md:grid-cols-4">
          <Field label="Employee">
            <select className="input" value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}>
              <option value="">All employees</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </select>
          </Field>
          <Field label="Start"><input className="input" type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></Field>
          <Field label="End"><input className="input" type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></Field>
          <button className="btn btn-primary self-end" onClick={load}><RefreshCcw size={17} />Apply</button>
        </div>
      ) : null}
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

function taskStatusTone(status: string) {
  if (status === "Completed") return "bg-emerald-50 text-emerald-700";
  if (status === "In Progress") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

const priorityMeta: Record<"High" | "Medium" | "Low", { dot: string; ring: string; label: string }> = {
  High: { dot: "bg-rose-500", ring: "border-l-rose-400", label: "text-rose-700" },
  Medium: { dot: "bg-amber-500", ring: "border-l-amber-400", label: "text-amber-700" },
  Low: { dot: "bg-emerald-500", ring: "border-l-emerald-400", label: "text-emerald-700" },
};

function Tasks({ isAdmin }: { isAdmin: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [date, setDate] = useState(today);
  const [employeeId, setEmployeeId] = useState("");
  const [message, setMessage] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ title: string; company: string; priority: "High" | "Medium" | "Low"; deadline: string }>({ title: "", company: "", priority: "Medium", deadline: "" });
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportPeriod, setReportPeriod] = useState("Today");

  function openAdd() {
    if (isAdmin) setAssignEmployeeId(employeeId || String(employees[0]?.id ?? ""));
    setForm({ title: "", company: "", priority: "Medium", deadline: "" });
    setMessage("");
    setAddOpen(true);
  }

  // Report/export date range for the selected preset.
  function reportRange(): { start: string; end: string } {
    const d = new Date();
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    if (reportPeriod === "Today") return { start: iso(d), end: iso(d) };
    if (reportPeriod === "Yesterday") { const y = new Date(d); y.setDate(d.getDate() - 1); return { start: iso(y), end: iso(y) }; }
    if (reportPeriod === "Last 7 days") { const s = new Date(d); s.setDate(d.getDate() - 6); return { start: iso(s), end: iso(d) }; }
    const s = new Date(d); s.setMonth(d.getMonth() - 3); return { start: iso(s), end: iso(d) };
  }

  const exportHref = (() => {
    const { start, end } = reportRange();
    const p = new URLSearchParams({ start, end });
    if (isAdmin && employeeId) p.set("employeeId", employeeId);
    return `/api/tasks.csv?${p.toString()}`;
  })();

  async function load() {
    const params = new URLSearchParams({ date });
    if (isAdmin && employeeId) params.set("employeeId", employeeId);
    const data = await api<{ tasks: Task[]; employees?: Employee[] }>(`/tasks?${params.toString()}`);
    setTasks(data.tasks);
    if (data.employees) setEmployees(data.employees);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load tasks"));
  }, []);

  async function addTask(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (isAdmin && !assignEmployeeId) { setMessage("Choose an employee to assign the task to."); return; }
    setBusy(true);
    setMessage("");
    try {
      const payload: Record<string, unknown> = { ...form, task_date: date };
      if (isAdmin) payload.employee_id = Number(assignEmployeeId);
      await api("/tasks", { method: "POST", body: JSON.stringify(payload) });
      setAddOpen(false);
      setForm({ title: "", company: "", priority: "Medium", deadline: "" });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to add task");
    }
    setBusy(false);
  }

  async function patchTask(id: number, body: Record<string, unknown>) {
    await api(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(body) });
    await load();
  }

  async function removeTask(id: number) {
    if (!window.confirm("Delete this task permanently?")) return;
    await api(`/tasks/${id}`, { method: "DELETE" });
    await load();
  }

  const completed = tasks.filter((t) => t.status === "Completed").length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;
  const pending = tasks.length - completed - inProgress;
  const groups = (["High", "Medium", "Low"] as const).map((p) => [p, tasks.filter((t) => t.priority === p)] as const);

  return (
    <section className="space-y-5">
      <PageTitle
        title="Daily Tasks"
        description={isAdmin ? "Review and assign employee tasks for the day, by priority." : "Plan your day per brand, set priority, and mark what's done."}
        action={<button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={17} />{isAdmin ? "Assign task" : "Add task"}</button>}
      />
      {message ? <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-700">{message}</div> : null}

      <div className={classNames("card grid gap-3 p-4", isAdmin ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {isAdmin ? (
          <Field label="Employee">
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">All employees</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Day"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <button type="button" className="btn btn-primary self-end" onClick={load}><RefreshCcw size={17} />Show</button>
      </div>

      {/* End-of-day summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm font-medium text-slate-500">Total tasks</p><p className="mt-1 text-2xl font-bold text-ink">{tasks.length}</p></div>
        <div className="card p-4"><p className="text-sm font-medium text-slate-500">Completed</p><p className="mt-1 text-2xl font-bold text-emerald-600">{completed}</p></div>
        <div className="card p-4"><p className="text-sm font-medium text-slate-500">Pending / In progress</p><p className="mt-1 text-2xl font-bold text-amber-600">{pending + inProgress}</p></div>
      </div>

      {/* Task report — export to CSV */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Report period">
          <select className="input" value={reportPeriod} onChange={(e) => setReportPeriod(e.target.value)}>
            <option>Today</option>
            <option>Yesterday</option>
            <option>Last 7 days</option>
            <option>Last 3 months</option>
          </select>
        </Field>
        <a className="btn btn-primary self-end" href={exportHref}><Download size={17} />Export CSV</a>
        <p className="self-center text-xs text-slate-400">{isAdmin && employeeId ? "Selected employee" : isAdmin ? "All employees" : "Your tasks"} · {reportRange().start} → {reportRange().end}</p>
      </div>

      {tasks.length === 0 ? (
        <EmptyState title={isAdmin ? "No tasks for this selection." : "No tasks yet for this day — add your first one."} />
      ) : (
        groups.map(([priority, list]) => list.length ? (
          <div key={priority} className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <span className={classNames("h-2.5 w-2.5 rounded-full", priorityMeta[priority].dot)} />
              <h3 className={classNames("font-bold", priorityMeta[priority].label)}>{priority} priority</h3>
              <span className="text-xs text-slate-400">· {list.length}</span>
            </div>
            <div className="divide-y divide-line">
              {list.map((task) => (
                <div key={task.id} className={classNames("flex flex-col gap-3 border-l-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between", priorityMeta[task.priority].ring)}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={classNames("font-semibold text-ink", task.status === "Completed" && "line-through text-slate-400")}>{task.title}</p>
                      {task.company ? <span className="badge bg-sky-50 text-sky-700">{task.company}</span> : null}
                      {task.assigned_by_admin ? <span className="badge bg-orange-50 text-orange-700">From admin</span> : null}
                      {task.deadline ? <span className="badge bg-rose-50 text-rose-700">Due {task.deadline}</span> : null}
                    </div>
                    {isAdmin ? <p className="mt-0.5 text-xs text-slate-500">{task.employee_name}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="input h-9 w-auto py-1 text-xs" value={task.priority} onChange={(e) => patchTask(task.id, { priority: e.target.value })}>
                      <option>High</option><option>Medium</option><option>Low</option>
                    </select>
                    <select className={classNames("input h-9 w-auto py-1 text-xs font-semibold", taskStatusTone(task.status))} value={task.status} onChange={(e) => patchTask(task.id, { status: e.target.value })}>
                      <option>Pending</option><option>In Progress</option><option>Completed</option>
                    </select>
                    {isAdmin ? (
                      <button type="button" className="btn btn-soft" title="Delete task (admin only)" onClick={() => removeTask(task.id)}><Trash2 size={16} /></button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null)
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 animate-fade-in">
          <form onSubmit={addTask} className="card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-ink">{isAdmin ? "Assign task" : "Add task"} for {date}</h3>
            <p className="text-xs text-slate-500">{isAdmin ? "The employee will see this on their board flagged “From admin” and can update its status." : "Once added, only an admin can delete it — you can still update its status."}</p>
            {isAdmin ? (
              <Field label="Assign to">
                <select required className="input" value={assignEmployeeId} onChange={(e) => setAssignEmployeeId(e.target.value)}>
                  <option value="">Select employee</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </Field>
            ) : null}
            <Field label="Task"><input autoFocus required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Schedule Instagram reels" /></Field>
            <Field label="Company / Brand"><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Which brand is this for?" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Priority">
                <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as "High" | "Medium" | "Low" })}>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
              </Field>
              <Field label="Deadline (optional)">
                <input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn btn-soft" onClick={() => setAddOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : isAdmin ? "Assign task" : "Add task"}</button>
            </div>
          </form>
        </div>
      )}
    </section>
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

  // A month is generatable only if it's strictly before the current month.
  const curIndex = now.getFullYear() * 12 + (now.getMonth() + 1);
  const genIsPast = genYear * 12 + genMonth < curIndex;
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
      <DataTable
        title="Salary Records"
        rows={rows}
        columns={[
          ["Employee", (row) => row.employee_name ?? row.employee_code],
          ["Period", (row) => `${row.salary_month}/${row.salary_year}`],
          ["Gross", (row) => `₹${row.gross_salary}`],
          ["Net", (row) => `₹${row.net_salary}`],
          ["Status", (row) => <Badge value={row.status} />],
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
