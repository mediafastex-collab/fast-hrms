const fs = require('fs');
let code = fs.readFileSync('functions/api/[[path]].ts', 'utf8');

const funcInsert = 'async function deleteNamed(db: D1Database, table: "departments" | "designations", field: "department_id" | "designation_id", id: number) {';
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

// Fix duplicate functions
const duplicateNumOrNull = `function numOrNull(value: unknown) {
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
}

function numOrNull(value: unknown) {`;

code = code.replace(duplicateNumOrNull, 'function numOrNull(value: unknown) {');

fs.writeFileSync('functions/api/[[path]].ts', code);
