const fs = require('fs');

function patchApp() {
  let code = fs.readFileSync('src/App.tsx', 'utf8');

  // 1. EmployeeDashboard Sunday Check-in logic
  code = code.replace(
    'const hasCheckedIn = Boolean(summary.todayAttendance?.check_in);',
    'const isSunday = new Date().getDay() === 0;\n  const hasCheckedIn = Boolean(summary.todayAttendance?.check_in);'
  );
  
  code = code.replace(
    '{!hasCheckedIn ? (',
    '{isSunday ? (\n                   <span className="badge bg-slate-100 text-slate-600 px-4 py-2 text-sm border border-slate-200">Weekend (No check-in)</span>\n                ) : !hasCheckedIn ? ('
  );

  // 2. formatTime to show seconds
  code = code.replace(
    'return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;',
    'return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;'
  );

  // 3. Departments Edit Modal inputs for shift
  const deptEditOriginal = `<Field label="Name">
              <input className="input" value={editingDept.name} onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })} />
            </Field>`;
  const deptEditNew = `<Field label="Name">
              <input className="input" value={editingDept.name} onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Shift Min Hours">
                <input className="input" type="number" step="0.5" min="0" placeholder={companyDefaults?.shift_min_hours?.toString()} value={editingDept.shift_min_hours ?? ""} onChange={(e) => setEditingDept({ ...editingDept, shift_min_hours: e.target.value ? Number(e.target.value) : undefined })} />
              </Field>
              <Field label="Half Day Min Hours">
                <input className="input" type="number" step="0.5" min="0" placeholder={companyDefaults?.half_day_min_hours?.toString()} value={editingDept.half_day_min_hours ?? ""} onChange={(e) => setEditingDept({ ...editingDept, half_day_min_hours: e.target.value ? Number(e.target.value) : undefined })} />
              </Field>
            </div>
            <Field label="Late Mark Time">
              <input className="input" type="time" placeholder={companyDefaults?.late_mark_time} value={editingDept.late_mark_time ?? ""} onChange={(e) => setEditingDept({ ...editingDept, late_mark_time: e.target.value || undefined })} />
            </Field>`;
  code = code.replace(deptEditOriginal, deptEditNew);

  // 4. Payroll Admin Period logic & Delete proof
  const payrollStateOriginal = `function Payroll({ isAdmin }: { isAdmin: boolean }) {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const [month, setMonth] = useState(d.getMonth() + 1);
  const [year, setYear] = useState(d.getFullYear());
  const [period, setPeriod] = useState("Last 6 Months");`;
  const payrollStateNew = `function Payroll({ isAdmin }: { isAdmin: boolean }) {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const [month, setMonth] = useState(d.getMonth() + 1);
  const [year, setYear] = useState(d.getFullYear());
  const [period, setPeriod] = useState(isAdmin ? "Custom" : "Last 6 Months");`;
  code = code.replace(payrollStateOriginal, payrollStateNew);

  const loadOriginal = `async function load() {
    let url = \`/payroll?month=\${month}&year=\${year}\`;
    if (!isAdmin) {
      url = \`/payroll?period=\${period === "Custom" ? "Custom" : period === "Last 6 Months" ? "Last 6 Months" : period === "Last 3 Months" ? "Last 3 Months" : "Last Month"}&month=\${month}&year=\${year}\`;
    }`;
  const loadNew = `async function load() {
    let url = \`/payroll?period=\${period === "Custom" ? "Custom" : period === "Last 6 Months" ? "Last 6 Months" : period === "Last 3 Months" ? "Last 3 Months" : "Last Month"}&month=\${month}&year=\${year}\`;`;
  code = code.replace(loadOriginal, loadNew);

  const generateOriginal = `  async function generate() {
    if (!window.confirm(\`Generate payroll for \${month}/\${year}? Existing un-paid records will be overwritten.\`)) return;
    try {`;
  const generateNew = `  async function generate() {
    const today = new Date();
    if (year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth() + 1)) {
      alert("You can only generate payroll for past months.");
      return;
    }
    if (!window.confirm(\`Generate payroll for \${month}/\${year}? Existing un-paid records will be overwritten.\`)) return;
    try {`;
  code = code.replace(generateOriginal, generateNew);

  const deleteProofNew = `
  async function removeProof(id: number) {
    if (!window.confirm("Delete payment proof?")) return;
    await api(\`/payroll/\${id}\`, { method: "PUT", body: JSON.stringify({ payment_proof: null }) });
    await load();
  }
`;
  code = code.replace('  async function load() {', deleteProofNew + '  async function load() {');

  const uiOriginal = `        {!isAdmin && (
          <Field label="Period">
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>`;
  const uiNew = `        {true && (
          <Field label="Period">
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>`;
  code = code.replace(uiOriginal, uiNew);

  const btnOriginal = `<button type="button" className="btn btn-soft" onClick={load}><RefreshCcw size={17} />{isAdmin ? "Load" : "Apply"}</button>`;
  const btnNew = `<button type="button" className="btn btn-soft" onClick={load}><RefreshCcw size={17} />Apply</button>`;
  code = code.replace(btnOriginal, btnNew);

  const actionOriginal = `{row.payment_proof && (
                  <a className="btn btn-soft" href={row.payment_proof} download={\`payment_proof_\${row.employee_name}_\${row.salary_month}.jpg\`} title="Payment Proof">
                    <ImageIcon size={17} /><span className="hidden sm:inline">Proof</span>
                  </a>
                )}
                {isAdmin && (
                  <>
                    <button type="button" className="btn btn-soft" onClick={() => handleEditClick(row)}>Edit</button>`;
  const actionNew = `{row.payment_proof && (
                  <div className="flex gap-1">
                    <a className="btn btn-soft" href={row.payment_proof} download={\`payment_proof_\${row.employee_name}_\${row.salary_month}.jpg\`} title="Payment Proof">
                      <ImageIcon size={17} /><span className="hidden sm:inline">Proof</span>
                    </a>
                    {isAdmin && <button type="button" className="btn btn-soft text-red-500" onClick={() => removeProof(row.id)}>X</button>}
                  </div>
                )}
                {isAdmin && (
                  <>
                    <button type="button" className="btn btn-soft" onClick={() => handleEditClick(row)}>Edit</button>`;
  code = code.replace(actionOriginal, actionNew);

  fs.writeFileSync('src/App.tsx', code);
  console.log("Patched App.tsx successfully.");
}

function patchApi() {
  let code = fs.readFileSync('functions/api/[[path]].ts', 'utf8');

  const originalPayrollList = `  if (method === "GET" && path === "/payroll") return payrollList(db, user, Number(url.searchParams.get("month")), Number(url.searchParams.get("year")));`;
  const newPayrollList = `  if (method === "GET" && path === "/payroll") return payrollList(db, user, url.searchParams.get("period"), Number(url.searchParams.get("month")), Number(url.searchParams.get("year")));`;
  code = code.replace(originalPayrollList, newPayrollList);

  const listOriginal = `async function payrollList(db: D1Database, user: AppUser, month: number, year: number) {
  let query = \`SELECT s.*, e.full_name AS employee_name, e.employee_code 
               FROM salaries s JOIN employees e ON e.id = s.employee_id 
               WHERE s.salary_month = ? AND s.salary_year = ?\`;
  const params: unknown[] = [month, year];

  if (user.role === "Employee") {
    query += " AND s.employee_id = (SELECT id FROM employees WHERE user_id = ?)";
    params.push(user.id);
  }
  
  query += " ORDER BY e.full_name ASC";
  
  const rows = await db.prepare(query).bind(...params).all();`;
  const listNew = `async function payrollList(db: D1Database, user: AppUser, period: string | null, month: number, year: number) {
  let query = \`SELECT s.*, e.full_name AS employee_name, e.employee_code 
               FROM salaries s JOIN employees e ON e.id = s.employee_id WHERE 1=1\`;
  const params: unknown[] = [];

  if (period === "Last 6 Months") {
    query += " AND s.salary_year * 12 + s.salary_month >= ? - 6";
    const d = new Date();
    params.push(d.getFullYear() * 12 + d.getMonth() + 1);
  } else if (period === "Last 3 Months") {
    query += " AND s.salary_year * 12 + s.salary_month >= ? - 3";
    const d = new Date();
    params.push(d.getFullYear() * 12 + d.getMonth() + 1);
  } else if (period === "Last Month") {
    query += " AND s.salary_year * 12 + s.salary_month = ? - 1";
    const d = new Date();
    params.push(d.getFullYear() * 12 + d.getMonth() + 1);
  } else {
    query += " AND s.salary_month = ? AND s.salary_year = ?";
    params.push(month, year);
  }

  if (user.role === "Employee") {
    query += " AND s.employee_id = (SELECT id FROM employees WHERE user_id = ?)";
    params.push(user.id);
  }
  
  query += " ORDER BY s.salary_year DESC, s.salary_month DESC, e.full_name ASC";
  
  const rows = await db.prepare(query).bind(...params).all();`;
  code = code.replace(listOriginal, listNew);

  const genOriginal = `async function generatePayroll(db: D1Database, month: number, year: number) {
  const employees = await db.prepare("SELECT * FROM employees WHERE is_active = 1").all<Record<string, unknown>>();`;
  const genNew = `async function generatePayroll(db: D1Database, month: number, year: number) {
  const today = new Date();
  if (year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth() + 1)) {
    throw new Error("Cannot generate payroll for current or future months.");
  }
  const employees = await db.prepare("SELECT * FROM employees WHERE is_active = 1").all<Record<string, unknown>>();`;
  code = code.replace(genOriginal, genNew);

  const dateOnlyOriginal = `function dateOnly(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function timeOnly(date = new Date()) {
  // Seconds precision so the client work timer starts from zero at check-in.
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}`;
  const dateOnlyNew = `// Attendance rules (late mark, shift hours) are configured in local Indian time,
// but Workers run in UTC — format all dates/times in IST so they match.
const timeZone = "Asia/Kolkata";

function dateOnly(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function timeOnly(date = new Date()) {
  // Seconds precision so the client work timer starts from zero at check-in.
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}`;
  code = code.replace(`function dateOnly(date = new Date()) {\n  return date.toISOString().slice(0, 10);\n}\n\nfunction timeOnly(date = new Date()) {\n  return date.toISOString().slice(11, 16);\n}`, dateOnlyNew);

  const toSecondsOriginal = `function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 100) / 100);
}`;
  const toSecondsNew = `function toSeconds(value: string) {
  const [h = 0, m = 0, s = 0] = value.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function hoursBetween(start: string, end: string) {
  return Math.max(0, Math.round(((toSeconds(end) - toSeconds(start)) / 3600) * 100) / 100);
}`;
  code = code.replace(toSecondsOriginal, toSecondsNew);
  
  // also update to make sure we parse the payment_proof up to ~2MB
  const docOrNullOriginal = `function numOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}`;
  const docOrNullNew = `function numOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Accept a base64 data URL for an uploaded document; cap at ~2MB to protect the D1 row.
function docOrNull(value: unknown) {
  const str = typeof value === "string" ? value.trim() : "";
  if (!str) return null;
  if (!str.startsWith("data:")) return null;
  if (str.length > 2_800_000) throw new Error("Document is too large (max ~2MB). Please upload a smaller file.");
  return str;
}`;
  code = code.replace(docOrNullOriginal, docOrNullNew);
  
  // payroll PUT API modification to use docOrNull
  const payrollPutOrig = `    const allowed = ["working_days", "paid_days", "gross_salary", "deductions", "net_salary", "status", "payment_proof"];`;
  const payrollPutNew = `    const allowed = ["working_days", "paid_days", "gross_salary", "deductions", "net_salary", "status"];
    if ("payment_proof" in updates) {
      if (updates.payment_proof === null) {
        setClauses.push("payment_proof = ?");
        params.push(null);
      } else {
        setClauses.push("payment_proof = ?");
        params.push(docOrNull(updates.payment_proof));
      }
    }`;
  code = code.replace(payrollPutOrig, payrollPutNew);

  fs.writeFileSync('functions/api/[[path]].ts', code);
  console.log("Patched api.ts successfully.");
}

try {
  patchApp();
  patchApi();
} catch (e) {
  console.error(e);
}
