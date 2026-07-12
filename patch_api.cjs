const fs = require('fs');
let code = fs.readFileSync('functions/api/[[path]].ts', 'utf8');

// 1. Add PUT /departments router
const routeInsert = '  if (method === "DELETE" && path.startsWith("/departments/"))';
const routeAdd = '  if (method === "PUT" && path.startsWith("/departments/")) return updateDepartment(db, user, Number(path.split("/").pop()), await readBody(context.request));\n' + routeInsert;
code = code.replace(routeInsert, routeAdd);

// 2. Add updateDepartment function
const funcInsert = 'async function deleteNamed(db: D1Database, table: string, refColumn: string, id: number) {';
const funcAdd = `async function updateDepartment(db: D1Database, user: AppUser, id: number, body: Record<string, unknown>) {
  requireAdmin(user);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new Error("Department name is required.");
  const shift_min = numOrNull(body.shift_min_hours);
  const half_day = numOrNull(body.half_day_min_hours);
  const late_time = typeof body.late_mark_time === "string" && body.late_mark_time ? body.late_mark_time : null;
  
  try {
    await db.prepare("UPDATE departments SET name = ?, shift_min_hours = ?, half_day_min_hours = ?, late_mark_time = ? WHERE id = ?")
      .bind(name, shift_min, half_day, late_time, id)
      .run();
    return json({ ok: true });
  } catch (err: any) {
    if (err.message.includes("UNIQUE")) throw new Error("A department with this name already exists.");
    throw err;
  }
}

` + funcInsert;
code = code.replace(funcInsert, funcAdd);

// 3. Add validation for generating payroll
const generateOrig = `async function generatePayroll(db: D1Database, month: number, year: number) {
  const employees = await db.prepare("SELECT * FROM employees WHERE is_active = 1").all<Record<string, unknown>>();`;
const generateNew = `async function generatePayroll(db: D1Database, month: number, year: number) {
  const today = new Date();
  if (year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth() + 1)) {
    throw new Error("Cannot generate payroll for current or future months.");
  }
  const employees = await db.prepare("SELECT * FROM employees WHERE is_active = 1").all<Record<string, unknown>>();`;
code = code.replace(generateOrig, generateNew);

// 4. Update the docOrNull to handle 2MB for payment_proof
const numOrNullOrig = `function numOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}`;
const numOrNullNew = `function numOrNull(value: unknown) {
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
code = code.replace(numOrNullOrig, numOrNullNew);

const putPayrollOrig = `    const allowed = ["working_days", "paid_days", "gross_salary", "deductions", "net_salary", "status", "payment_proof"];`;
const putPayrollNew = `    const allowed = ["working_days", "paid_days", "gross_salary", "deductions", "net_salary", "status"];
    if ("payment_proof" in updates) {
      if (updates.payment_proof === null || updates.payment_proof === "") {
        setClauses.push("payment_proof = ?");
        params.push(null);
      } else {
        setClauses.push("payment_proof = ?");
        params.push(docOrNull(updates.payment_proof));
      }
    }`;
code = code.replace(putPayrollOrig, putPayrollNew);

fs.writeFileSync('functions/api/[[path]].ts', code);
console.log("Patched API successfully");
