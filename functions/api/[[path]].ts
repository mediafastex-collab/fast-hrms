type Env = {
  HRMS_DB: D1Database;
  SESSION_SECRET?: string;
};

type AppUser = {
  id: number;
  email: string;
  role: "Superadmin" | "Employee";
  employeeId?: number;
  employeeName?: string;
};

type Context = EventContext<Env, string, unknown>;

const jsonHeaders = { "Content-Type": "application/json" };
const sessionCookie = "fast_hrms_session";

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await route(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return json({ error: message }, 500);
  }
};

async function route(context: Context) {
  const url = new URL(context.request.url);
  // [[path]] catch-all gives an array of segments — join with "/" (not comma) so /tasks/5, /payroll/5 etc. match.
  const rawPath = context.params.path;
  const path = "/" + (Array.isArray(rawPath) ? rawPath.join("/") : rawPath ? String(rawPath) : "");
  const method = context.request.method;
  const db = context.env.HRMS_DB;
  const user = await currentUser(context);

  if (method === "POST" && path === "/login") return login(context);
  if (method === "POST" && path === "/logout") return logout(context);
  if (method === "GET" && path === "/me") return user ? json({ user }) : json({ error: "Not authenticated" }, 401);

  if (!user) return json({ error: "Please login first" }, 401);

  if (method === "GET" && path === "/meta") return json(await meta(db));
  if (method === "GET" && path === "/profile") return json({ employee: await employeeForUser(db, user) });
  if (method === "GET" && path === "/employee/summary") return employeeSummary(db, user);
  if (method === "GET" && path === "/attendance") return attendanceList(db, user, url);
  if (method === "POST" && path === "/attendance/check-in") return checkIn(db, user, await readBody(context.request));
  if (method === "POST" && path === "/attendance/check-out") return checkOut(db, user, await readBody(context.request));
  if (method === "POST" && path === "/attendance/break-start") return takeBreak(db, user);
  if (method === "POST" && path === "/attendance/break-end") return endBreak(db, user);
  if (method === "GET" && path === "/leaves") return leaveList(db, user);
  if (method === "POST" && path === "/leaves") return applyLeave(db, user, await readBody(context.request));
  if (method === "GET" && path === "/payroll") return payrollList(db, user, url);
  if (method === "GET" && path.startsWith("/salary-slips/")) return salarySlip(db, user, Number(path.split("/").pop()));
  if (method === "GET" && path === "/holidays") return holidayList(db);
  if (method === "GET" && path === "/settings") return json({ settings: await companySettings(db) });
  if (method === "GET" && path === "/tasks") return taskList(db, user, url);
  if (method === "GET" && path === "/tasks.csv") return tasksCsv(db, user, url);
  if (method === "POST" && path === "/tasks") return createTask(db, user, await readBody(context.request));
  if (method === "PUT" && path.match(/^\/tasks\/\d+$/)) return updateTask(db, user, Number(path.split("/").pop()), await readBody(context.request));

  requireAdmin(user);

  if (method === "GET" && path === "/admin/summary") return adminSummary(db);
  if (method === "GET" && path === "/employees") return employeesList(db);
  if (method === "POST" && path === "/employees") return saveEmployee(db, user, await readBody(context.request));
  if (method === "PUT" && path.startsWith("/employees/")) return updateEmployee(db, user, Number(path.split("/").pop()), await readBody(context.request));
  if (method === "POST" && path === "/departments") return createNamed(db, user, "departments", await readBody(context.request));
  if (method === "POST" && path === "/designations") return createNamed(db, user, "designations", await readBody(context.request));
  if (method === "PUT" && path.startsWith("/departments/")) return updateDepartment(db, user, Number(path.split("/").pop()), await readBody(context.request));
  if (method === "DELETE" && path.startsWith("/departments/")) return deleteNamed(db, "departments", "department_id", Number(path.split("/").pop()));
  if (method === "DELETE" && path.startsWith("/designations/")) return deleteNamed(db, "designations", "designation_id", Number(path.split("/").pop()));
  if (method === "POST" && path === "/attendance/manual") return manualAttendance(db, user, await readBody(context.request));
  if (method === "GET" && path === "/attendance.csv") return attendanceCsv(db, user, url);
  if (method === "POST" && path.match(/^\/leaves\/\d+\/decision$/)) return decideLeave(db, user, Number(path.split("/")[2]), await readBody(context.request));
  if (method === "POST" && path === "/leave-types") return saveLeaveType(db, user, await readBody(context.request));
  if (method === "DELETE" && path.startsWith("/leave-types/")) return deleteLeaveType(db, user, Number(path.split("/").pop()));
  if (method === "POST" && path === "/payroll/generate") return generatePayroll(db, user, await readBody(context.request));
  if (method === "PUT" && path.startsWith("/payroll/")) return updateSalary(db, user, Number(path.split("/").pop()), await readBody(context.request));
  if (method === "POST" && path === "/holidays") return saveHoliday(db, user, await readBody(context.request));
  if (method === "DELETE" && path.startsWith("/holidays/")) return deleteHoliday(db, user, Number(path.split("/").pop()));
  if (method === "PUT" && path === "/settings") return saveSettings(db, user, await readBody(context.request));
  if (method === "DELETE" && path.match(/^\/tasks\/\d+$/)) return deleteTask(db, user, Number(path.split("/").pop()));
  if (method === "GET" && path === "/audit-logs") return auditLogs(db);
  if (method === "GET" && path === "/reports/meta") return reportsMeta(db);
  if (method === "GET" && path === "/reports/leaves.csv") return leaveCsv(db, url);
  if (method === "GET" && path === "/reports/salaries.csv") return salaryCsv(db, url);

  return json({ error: "Route not found" }, 404);
}

async function login(context: Context) {
  const body = await readBody(context.request);
  const email = text(body.email).toLowerCase();
  const password = text(body.password);
  if (!email || !password) return json({ error: "Email and password are required" }, 400);

  const row = await context.env.HRMS_DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.role, e.id AS employeeId, e.full_name AS employeeName
     FROM users u LEFT JOIN employees e ON e.user_id = u.id
     WHERE u.email = ? AND u.is_active = 1`,
  )
    .bind(email)
    .first<Record<string, string | number>>();

  if (!row || !(await verifyPassword(password, String(row.password_hash)))) return json({ error: "Invalid email or password" }, 401);

  const user = compactUser(row);
  const token = await signSession(user, context.env.SESSION_SECRET);
  const secure = new URL(context.request.url).protocol === "https:" ? "; Secure" : "";
  return json(
    { user },
    200,
    { "Set-Cookie": `${sessionCookie}=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${secure}` },
  );
}

function logout(context: Context) {
  const secure = new URL(context.request.url).protocol === "https:" ? "; Secure" : "";
  return json({ ok: true }, 200, { "Set-Cookie": `${sessionCookie}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}` });
}

async function currentUser(context: Context): Promise<AppUser | null> {
  const token = cookie(context.request, sessionCookie);
  if (!token) return null;
  const user = await verifySession(token, context.env.SESSION_SECRET);
  if (!user) return null;
  const active = await context.env.HRMS_DB.prepare("SELECT is_active FROM users WHERE id = ?").bind(user.id).first<{ is_active: number }>();
  return active?.is_active ? user : null;
}

async function meta(db: D1Database) {
  const [departments, designations] = await Promise.all([
    db.prepare("SELECT id, name FROM departments ORDER BY name").all(),
    db.prepare("SELECT id, name FROM designations ORDER BY name").all(),
  ]);
  return { departments: departments.results, designations: designations.results };
}

async function adminSummary(db: D1Database) {
  const today = dateOnly();
  const monthStart = today.slice(0, 8) + "01";
  const [
    totalEmployees,
    presentToday,
    absentToday,
    pendingLeaveRequests,
    approvedLeavesThisMonth,
    pendingSalaries,
    salaryDoneCount,
    estimatedMonthlyPayroll,
  ] = await Promise.all([
    scalar(db, "SELECT COUNT(*) FROM employees WHERE employment_status = 'Active'"),
    scalar(db, "SELECT COUNT(*) FROM attendance WHERE attendance_date = ? AND status IN ('Present', 'Late', 'Half Day')", today),
    scalar(db, "SELECT COUNT(*) FROM employees WHERE employment_status = 'Active'") .then(async (total) => total - await scalar(db, "SELECT COUNT(DISTINCT employee_id) FROM attendance WHERE attendance_date = ?", today)),
    scalar(db, "SELECT COUNT(*) FROM leave_requests WHERE status = 'Pending'"),
    scalar(db, "SELECT COUNT(*) FROM leave_requests WHERE status = 'Approved' AND start_date >= ?", monthStart),
    scalar(db, "SELECT COUNT(*) FROM salaries WHERE status = 'Pending'"),
    scalar(db, "SELECT COUNT(*) FROM salaries WHERE status = 'Done'"),
    scalar(db, "SELECT COALESCE(SUM(monthly_salary), 0) FROM employees WHERE employment_status = 'Active'"),
  ]);
  return json({
    summary: {
      totalEmployees,
      presentToday,
      absentToday,
      pendingLeaveRequests,
      approvedLeavesThisMonth,
      pendingSalaries,
      salaryDoneCount,
      estimatedMonthlyPayroll,
    },
  });
}

async function employeeSummary(db: D1Database, user: AppUser) {
  const employee = await employeeForUser(db, user);
  const today = dateOnly();
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-31`;
  const [todayAttendance, attendanceRows, recentLeaves, currentSalary, latestSalary, paidLeave, upcomingLeaves, upcomingHolidays] = await Promise.all([
    db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?").bind(employee.id, today).first(),
    db.prepare("SELECT status, COUNT(*) AS count FROM attendance WHERE employee_id = ? AND attendance_date BETWEEN ? AND ? GROUP BY status").bind(employee.id, monthStart, monthEnd).all(),
    db.prepare(
      `SELECT lr.*, lt.name AS leave_type_name, lt.is_paid
       FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.employee_id = ? ORDER BY lr.created_at DESC LIMIT 5`,
    ).bind(employee.id).all(),
    db.prepare("SELECT * FROM salaries WHERE employee_id = ? AND salary_month = ? AND salary_year = ?").bind(employee.id, month, year).first(),
    db.prepare("SELECT * FROM salaries WHERE employee_id = ? ORDER BY salary_year DESC, salary_month DESC LIMIT 1").bind(employee.id).first(),
    scalar(db, "SELECT COALESCE(SUM(monthly_balance), 0) FROM leave_types WHERE is_paid = 1"),
    // Approved leave that hasn't finished yet.
    db.prepare(
      `SELECT lr.*, lt.name AS leave_type_name, lt.is_paid
       FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.employee_id = ? AND lr.status = 'Approved' AND lr.end_date >= ? ORDER BY lr.start_date ASC LIMIT 5`,
    ).bind(employee.id, today).all(),
    // Company holidays from today onward.
    db.prepare("SELECT id, name, holiday_date, description FROM holidays WHERE holiday_date >= ? ORDER BY holiday_date ASC LIMIT 5").bind(today).all(),
  ]);
  const monthAttendance = { present: 0, late: 0, halfDay: 0, absent: 0 };
  for (const row of attendanceRows.results as Array<{ status: string; count: number }>) {
    if (row.status === "Present") monthAttendance.present = row.count;
    if (row.status === "Late") monthAttendance.late = row.count;
    if (row.status === "Half Day") monthAttendance.halfDay = row.count;
    if (row.status === "Absent") monthAttendance.absent = row.count;
  }
  if (todayAttendance) await attachBreaks(db, [todayAttendance as Record<string, unknown>]);
  return json({ summary: { todayAttendance, monthAttendance, leaveBalance: paidLeave, recentLeaves: recentLeaves.results, currentSalary, latestSalary, upcomingLeaves: upcomingLeaves.results, upcomingHolidays: upcomingHolidays.results } });
}

async function employeesList(db: D1Database) {
  const employees = await db.prepare(employeeSelect("ORDER BY e.created_at DESC")).all();
  return json({ employees: employees.results, ...(await meta(db)) });
}

async function saveEmployee(db: D1Database, actor: AppUser, body: Record<string, unknown>) {
  const email = text(body.email).toLowerCase();
  const password = text(body.password) || "password123";
  validateEmployee(body);
  const hash = await hashPassword(password);
  const isActive = (text(body.employment_status) || "Active") === "Active" ? 1 : 0;
  const userResult = await db.prepare("INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'Employee', ?)").bind(email, hash, isActive).run();
  const userId = userResult.meta.last_row_id;
  const result = await db.prepare(
    `INSERT INTO employees (user_id, employee_code, full_name, email, phone, department_id, designation_id, joining_date, monthly_salary,
      employment_status, address, bank_name, account_number, ifsc_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, text(body.employee_code), text(body.full_name), email, text(body.phone), numOrNull(body.department_id), numOrNull(body.designation_id), text(body.joining_date), number(body.monthly_salary), text(body.employment_status) || "Active", text(body.address), text(body.bank_name), text(body.account_number), text(body.ifsc_code))
    .run();
  await audit(db, actor, "Employee added", "employees", result.meta.last_row_id, text(body.full_name));
  return json({ ok: true });
}

async function updateEmployee(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  validateEmployee(body);
  const existing = await db.prepare("SELECT user_id FROM employees WHERE id = ?").bind(id).first<{ user_id: number }>();
  if (!existing) return json({ error: "Employee not found" }, 404);
  const statusVal = text(body.employment_status) || "Active";
  await db.prepare(
    `UPDATE employees SET employee_code = ?, full_name = ?, email = ?, phone = ?, department_id = ?, designation_id = ?, joining_date = ?,
      monthly_salary = ?, employment_status = ?, address = ?, bank_name = ?, account_number = ?, ifsc_code = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(text(body.employee_code), text(body.full_name), text(body.email).toLowerCase(), text(body.phone), numOrNull(body.department_id), numOrNull(body.designation_id), text(body.joining_date), number(body.monthly_salary), statusVal, text(body.address), text(body.bank_name), text(body.account_number), text(body.ifsc_code), id)
    .run();
  const isActive = statusVal === "Active" ? 1 : 0;
  await db.prepare("UPDATE users SET email = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(text(body.email).toLowerCase(), isActive, existing.user_id).run();
  if (text(body.password)) {
    await db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(await hashPassword(text(body.password)), existing.user_id).run();
  }
  await audit(db, actor, "Employee edited", "employees", id, text(body.full_name));
  return json({ ok: true });
}

async function createNamed(db: D1Database, actor: AppUser, table: "departments" | "designations", body: Record<string, unknown>) {
  const name = text(body.name);
  if (!name) return json({ error: "Name is required" }, 400);
  const result = await db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).bind(name).run();
  await audit(db, actor, `${table.slice(0, -1)} added`, table, result.meta.last_row_id, name);
  return json({ ok: true });
}

async function updateDepartment(db: D1Database, user: AppUser, id: number, body: Record<string, unknown>) {
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

async function deleteNamed(db: D1Database, table: "departments" | "designations", field: "department_id" | "designation_id", id: number) {
  const used = await scalar(db, `SELECT COUNT(*) FROM employees WHERE ${field} = ?`, id);
  if (used) return json({ error: "Cannot delete while employees are using it" }, 400);
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

async function attendanceList(db: D1Database, user: AppUser, url: URL) {
  const rows = await attendanceRows(db, user, url);
  const employees = user.role === "Superadmin" ? (await db.prepare(employeeSelect("WHERE e.employment_status = 'Active' ORDER BY e.full_name")).all()).results : undefined;
  return json({ attendance: rows, employees });
}

async function attendanceRows(db: D1Database, user: AppUser, url: URL) {
  const start = url.searchParams.get("start") || "1900-01-01";
  const end = url.searchParams.get("end") || "2999-12-31";
  const employeeId = url.searchParams.get("employeeId");
  const params: unknown[] = [start, end];
  let where = "WHERE a.attendance_date BETWEEN ? AND ?";
  if (user.role === "Employee") {
    where += " AND a.employee_id = ?";
    params.push(user.employeeId);
  } else if (employeeId) {
    where += " AND a.employee_id = ?";
    params.push(employeeId);
  }
  const departmentId = url.searchParams.get("departmentId");
  if (user.role === "Superadmin" && departmentId) {
    where += " AND e.department_id = ?";
    params.push(departmentId);
  }
  const result = await db.prepare(
    `SELECT a.*, e.full_name AS employee_name, e.employee_code, d.name AS department_name
     FROM attendance a JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     ${where} ORDER BY a.attendance_date DESC, e.full_name`,
  ).bind(...params).all();
  return attachBreaks(db, result.results as Array<Record<string, unknown>>);
}

async function checkIn(db: D1Database, user: AppUser, body: Record<string, unknown>) {
  const employee = await employeeForUser(db, user);
  const settings = await companySettings(db);
  const time = timeOnly();
  const status = time > settings.late_mark_time ? "Late" : "Present";
  const reason = text(body.late_checkin_reason) || null;
  const result = await db.prepare("INSERT OR IGNORE INTO attendance (employee_id, attendance_date, check_in, status, late_checkin_reason) VALUES (?, ?, ?, ?, ?)")
    .bind(employee.id, dateOnly(), time, status, reason).run();
  if (!result.meta.changes) return json({ error: "You have already checked in today" }, 400);
  return json({ ok: true });
}

async function checkOut(db: D1Database, user: AppUser, body: Record<string, unknown>) {
  const employee = await employeeForUser(db, user);
  const current = await db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?").bind(employee.id, dateOnly()).first<Record<string, string>>();
  if (!current?.check_in) return json({ error: "Check in first" }, 400);
  if (current.check_out) return json({ error: "You have already checked out today" }, 400);
  const settings = await companySettings(db);
  const checkOutTime = timeOnly();
  // If a break is still open, close it at checkout time.
  await db.prepare("UPDATE attendance_breaks SET break_end = ? WHERE attendance_id = ? AND break_end IS NULL").bind(checkOutTime, current.id).run();
  // Worked hours = span minus every break taken today.
  const breakHours = await breakHoursFor(db, current);
  const hours = Math.max(0, hoursBetween(current.check_in, checkOutTime) - breakHours);
  const status = hours < settings.half_day_min_hours ? "Half Day" : current.status;
  const reason = text(body.early_checkout_reason) || null;
  await db.prepare("UPDATE attendance SET check_out = ?, total_hours = ?, status = ?, early_checkout_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(checkOutTime, hours, status, reason, current.id).run();
  return json({ ok: true });
}

async function takeBreak(db: D1Database, user: AppUser) {
  const employee = await employeeForUser(db, user);
  const current = await db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?").bind(employee.id, dateOnly()).first<Record<string, string>>();
  if (!current?.check_in) return json({ error: "Check in first" }, 400);
  if (current.check_out) return json({ error: "You have already checked out today" }, 400);
  const open = await db.prepare("SELECT id FROM attendance_breaks WHERE attendance_id = ? AND break_end IS NULL").bind(current.id).first();
  if (open) return json({ error: "You are already on a break" }, 400);
  const time = timeOnly();
  await db.prepare("INSERT INTO attendance_breaks (attendance_id, break_start) VALUES (?, ?)").bind(current.id, time).run();
  // Mirror the latest break onto the legacy columns for backward compatibility.
  await db.prepare("UPDATE attendance SET break_start = ?, break_end = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(time, current.id).run();
  return json({ ok: true });
}

async function endBreak(db: D1Database, user: AppUser) {
  const employee = await employeeForUser(db, user);
  const current = await db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?").bind(employee.id, dateOnly()).first<Record<string, string>>();
  if (!current) return json({ error: "Check in first" }, 400);
  const open = await db.prepare("SELECT id FROM attendance_breaks WHERE attendance_id = ? AND break_end IS NULL").bind(current.id).first<{ id: number }>();
  if (!open) return json({ error: "You are not on a break" }, 400);
  const time = timeOnly();
  await db.prepare("UPDATE attendance_breaks SET break_end = ? WHERE id = ?").bind(time, open.id).run();
  await db.prepare("UPDATE attendance SET break_end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(time, current.id).run();
  return json({ ok: true });
}

// Total closed-break hours for one attendance row (multi-break aware, legacy fallback).
async function breakHoursFor(db: D1Database, attendance: Record<string, string>) {
  const rows = await db.prepare("SELECT break_start, break_end FROM attendance_breaks WHERE attendance_id = ?").bind(attendance.id).all<{ break_start: string; break_end: string | null }>();
  if (rows.results.length) {
    return rows.results.reduce((sum, b) => sum + (b.break_end ? hoursBetween(b.break_start, b.break_end) : 0), 0);
  }
  return attendance.break_start && attendance.break_end ? hoursBetween(attendance.break_start, attendance.break_end) : 0;
}

// Attach a `breaks` array to attendance rows in one batched query.
async function attachBreaks(db: D1Database, rows: Array<Record<string, unknown>>) {
  const ids = rows.map((r) => Number(r.id)).filter(Boolean);
  if (!ids.length) return rows;
  const byAttendance = new Map<number, Array<Record<string, unknown>>>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const result = await db.prepare(
      `SELECT id, attendance_id, break_start, break_end, reason FROM attendance_breaks WHERE attendance_id IN (${chunk.map(() => "?").join(",")}) ORDER BY break_start`,
    ).bind(...chunk).all<Record<string, unknown>>();
    for (const b of result.results) {
      const key = Number(b.attendance_id);
      if (!byAttendance.has(key)) byAttendance.set(key, []);
      byAttendance.get(key)!.push(b);
    }
  }
  for (const row of rows) row.breaks = byAttendance.get(Number(row.id)) ?? [];
  return rows;
}

async function manualAttendance(db: D1Database, actor: AppUser, body: Record<string, unknown>) {
  const checkInAt = text(body.check_in);
  const checkOutAt = text(body.check_out);
  const breakStart = text(body.break_start) || null;
  const breakEnd = text(body.break_end) || null;
  let hours = checkInAt && checkOutAt ? hoursBetween(checkInAt, checkOutAt) : 0;
  if (breakStart && breakEnd) {
    hours = Math.max(0, hours - hoursBetween(breakStart, breakEnd));
  }
  await db.prepare(
    `INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, break_start, break_end, total_hours, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(employee_id, attendance_date) DO UPDATE SET check_in = excluded.check_in, check_out = excluded.check_out,
       break_start = excluded.break_start, break_end = excluded.break_end, total_hours = excluded.total_hours, 
       status = excluded.status, updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(number(body.employee_id), text(body.attendance_date), checkInAt, checkOutAt, breakStart, breakEnd, hours, text(body.status) || "Present")
    .run();
  await audit(db, actor, "Attendance edited", "attendance", number(body.employee_id), text(body.attendance_date));
  return json({ ok: true });
}

async function attendanceCsv(db: D1Database, user: AppUser, url: URL) {
  const rows = await attendanceRows(db, user, url) as Array<Record<string, unknown>>;
  const header = ["Employee", "Employee ID", "Department", "Date", "Check in", "Check out", "Breaks", "Hours", "Status"];
  const lines = rows.map((row) => {
    const breaks = (row.breaks as Array<Record<string, unknown>> | undefined ?? [])
      .map((b) => `${b.break_start}-${b.break_end ?? "…"}`).join("; ");
    return [row.employee_name, row.employee_code, row.department_name, row.attendance_date, row.check_in, row.check_out, breaks, row.total_hours, row.status].map(csvCell).join(",");
  });
  return new Response([header.join(","), ...lines].join("\n"), { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=attendance.csv" } });
}

async function leaveList(db: D1Database, user: AppUser) {
  const leaveTypes = (await db.prepare("SELECT * FROM leave_types ORDER BY name").all()).results;
  const employeeFilter = user.role === "Employee" ? "WHERE lr.employee_id = ?" : "";
  const bind = user.role === "Employee" ? [user.employeeId] : [];
  const leaves = await db.prepare(
    `SELECT lr.*, e.full_name AS employee_name, lt.name AS leave_type_name, lt.is_paid
     FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id JOIN leave_types lt ON lt.id = lr.leave_type_id
     ${employeeFilter} ORDER BY lr.created_at DESC`,
  ).bind(...bind).all();
  return json({ leaves: leaves.results, leaveTypes });
}

async function applyLeave(db: D1Database, user: AppUser, body: Record<string, unknown>) {
  const employee = await employeeForUser(db, user);
  const days = inclusiveDays(text(body.start_date), text(body.end_date));
  if (days < 1) return json({ error: "End date must be after start date" }, 400);
  const result = await db.prepare("INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(employee.id, number(body.leave_type_id), text(body.start_date), text(body.end_date), days, text(body.reason)).run();
  await notify(db, user.id, "Leave applied", "Your leave request was submitted.");
  return json({ ok: true, id: result.meta.last_row_id });
}

async function decideLeave(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  const status = text(body.status);
  if (!["Approved", "Rejected"].includes(status)) return json({ error: "Invalid leave status" }, 400);
  await db.prepare("UPDATE leave_requests SET status = ?, admin_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, text(body.admin_note), actor.id, id).run();
  const target = await db.prepare("SELECT e.user_id FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id WHERE lr.id = ?").bind(id).first<{ user_id: number }>();
  if (target) await notify(db, target.user_id, `Leave ${status.toLowerCase()}`, `Your leave request was ${status.toLowerCase()}.`);
  await audit(db, actor, `Leave ${status.toLowerCase()}`, "leave_requests", id, text(body.admin_note));
  return json({ ok: true });
}

async function saveLeaveType(db: D1Database, actor: AppUser, body: Record<string, unknown>) {
  const name = text(body.name);
  if (!name) return json({ error: "Leave type name is required" }, 400);
  const result = await db.prepare(
    `INSERT INTO leave_types (name, is_paid, monthly_balance, yearly_balance) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET is_paid = excluded.is_paid, monthly_balance = excluded.monthly_balance,
       yearly_balance = excluded.yearly_balance, updated_at = CURRENT_TIMESTAMP`,
  ).bind(name, number(body.is_paid) ? 1 : 0, number(body.monthly_balance), number(body.yearly_balance)).run();
  await audit(db, actor, "Leave type saved", "leave_types", result.meta.last_row_id, name);
  return json({ ok: true });
}

async function deleteLeaveType(db: D1Database, actor: AppUser, id: number) {
  const used = await scalar(db, "SELECT COUNT(*) FROM leave_requests WHERE leave_type_id = ?", id);
  if (used) return json({ error: "Cannot delete while leave requests are using it" }, 400);
  await db.prepare("DELETE FROM leave_types WHERE id = ?").bind(id).run();
  await audit(db, actor, "Leave type deleted", "leave_types", id, "");
  return json({ ok: true });
}

async function payrollList(db: D1Database, user: AppUser, url: URL) {
  // Same period filter for both roles. Current & future months are never shown
  // (payroll is only generated for completed months).
  const period = url.searchParams.get("period") || "Last Month";
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (user.role === "Employee") {
    conditions.push("s.employee_id = ?");
    params.push(user.employeeId);
  }

  const todayStr = dateOnly();
  const curIndex = Number(todayStr.slice(0, 4)) * 12 + Number(todayStr.slice(5, 7));
  if (period === "Custom") {
    const month = Number(url.searchParams.get("month"));
    const year = Number(url.searchParams.get("year"));
    if (!month || !year || year * 12 + month >= curIndex) return json({ salaries: [] });
    conditions.push("s.salary_month = ? AND s.salary_year = ?");
    params.push(month, year);
  } else {
    const monthsFor: Record<string, number> = { "Last Month": 1, "Last 3 Months": 3, "Last 6 Months": 6, "Last 12 Months": 12 };
    const n = monthsFor[period] ?? 1;
    // The N calendar months strictly before the current month.
    const hi = curIndex - 1;
    const lo = curIndex - n;
    conditions.push("(s.salary_year * 12 + s.salary_month) BETWEEN ? AND ?");
    params.push(lo, hi);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.prepare(
    `SELECT s.*, e.full_name AS employee_name, e.employee_code
     FROM salaries s JOIN employees e ON e.id = s.employee_id
     ${where}
     ORDER BY s.salary_year DESC, s.salary_month DESC, e.full_name ASC`,
  ).bind(...params).all();
  return json({ salaries: rows.results });
}

async function generatePayroll(db: D1Database, actor: AppUser, body: Record<string, unknown>) {
  const month = number(body.month);
  const year = number(body.year);
  const settings = await companySettings(db);
  const workingDays = workingDayCount(year, month, settings.working_days);
  const employees = await db.prepare(employeeSelect("WHERE e.employment_status = 'Active' ORDER BY e.full_name")).all<Record<string, number | string>>();
  for (const employee of employees.results) {
    const employeeId = Number(employee.id);
    const paidLeaveDays = await leaveDays(db, employeeId, month, year, true);
    const unpaidLeaveDays = await leaveDays(db, employeeId, month, year, false);
    const absentDays = settings.deduct_absent_days ? await scalar(db, "SELECT COUNT(*) FROM attendance WHERE employee_id = ? AND status = 'Absent' AND strftime('%m', attendance_date) = ? AND strftime('%Y', attendance_date) = ?", employeeId, pad(month), String(year)) : 0;
    const gross = Number(employee.monthly_salary);
    const deductionDays = unpaidLeaveDays + absentDays;
    const deductions = Math.round((gross / Math.max(workingDays, 1)) * deductionDays);
    const paidDays = Math.max(0, workingDays - deductionDays);
    const result = await db.prepare(
      `INSERT INTO salaries (employee_id, salary_month, salary_year, working_days, paid_days, paid_leave_days, unpaid_leave_days, absent_days, gross_salary, deductions, net_salary, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
       ON CONFLICT(employee_id, salary_month, salary_year) DO UPDATE SET working_days = excluded.working_days, paid_days = excluded.paid_days,
       paid_leave_days = excluded.paid_leave_days, unpaid_leave_days = excluded.unpaid_leave_days, absent_days = excluded.absent_days,
       gross_salary = excluded.gross_salary, deductions = excluded.deductions, net_salary = excluded.net_salary, updated_at = CURRENT_TIMESTAMP`,
    ).bind(employeeId, month, year, workingDays, paidDays, paidLeaveDays, unpaidLeaveDays, absentDays, gross, deductions, gross - deductions).run();
    const salary = await db.prepare("SELECT * FROM salaries WHERE employee_id = ? AND salary_month = ? AND salary_year = ?").bind(employeeId, month, year).first<Record<string, unknown>>();
    if (salary) await upsertSlip(db, salary, employee, settings);
    await notify(db, Number(employee.user_id), "Salary slip generated", `Salary slip for ${monthName(month)} ${year} is ready.`);
    await audit(db, actor, "Salary generated", "salaries", Number(result.meta.last_row_id || salary?.id), `${employee.full_name}`);
  }
  return json({ ok: true });
}

async function updateSalary(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  // UI uses Paid/Unpaid; the column stores Done/Pending.
  const raw = text(body.status);
  const status = raw === "Paid" ? "Done" : (raw === "Unpaid" || raw === "Generated") ? "Pending" : raw;
  if (status && !["Pending", "Done"].includes(status)) return json({ error: "Invalid salary status" }, 400);

  const existing = await db.prepare("SELECT s.*, e.user_id, e.id AS employee_id FROM salaries s JOIN employees e ON e.id = s.employee_id WHERE s.id = ?").bind(id).first<Record<string, unknown>>();
  if (!existing) return json({ error: "Salary record not found" }, 404);

  const newStatus = status || String(existing.status);
  const workingDays = body.working_days !== undefined ? Number(body.working_days) : Number(existing.working_days);
  const paidDays = body.paid_days !== undefined ? Number(body.paid_days) : Number(existing.paid_days);
  const grossSalary = body.gross_salary !== undefined ? Number(body.gross_salary) : Number(existing.gross_salary);
  const deductions = body.deductions !== undefined ? Number(body.deductions) : Number(existing.deductions);
  const netSalary = body.net_salary !== undefined ? Number(body.net_salary) : Number(existing.net_salary);
  // payment_proof: undefined = keep as-is; "" or null = clear it; a data URL = set it.
  const proofProvided = body.payment_proof !== undefined;
  const proofValue = proofProvided ? (String(body.payment_proof || "") || null) : null;

  await db.prepare(
    `UPDATE salaries SET status = ?, working_days = ?, paid_days = ?, gross_salary = ?, deductions = ?, net_salary = ?, ${proofProvided ? "payment_proof = ?," : ""} updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(...(proofProvided
    ? [newStatus, workingDays, paidDays, grossSalary, deductions, netSalary, proofValue, id]
    : [newStatus, workingDays, paidDays, grossSalary, deductions, netSalary, id])).run();

  const updatedSalary = await db.prepare("SELECT * FROM salaries WHERE id = ?").bind(id).first<Record<string, unknown>>();
  const employee = await db.prepare(employeeSelect("WHERE e.id = ?")).bind(existing.employee_id).first<Record<string, unknown>>();
  const settings = await companySettings(db);

  // Regenerate the cached payslip so it reflects the updated amounts.
  if (updatedSalary && employee) {
    await upsertSlip(db, updatedSalary, employee, settings);
  }

  if (status && status !== existing.status) {
    const label = status === "Done" ? "paid" : "unpaid";
    await notify(db, Number(existing.user_id), `Salary marked ${label}`, label === "paid" ? "Your salary is marked paid — your payslip is available." : "Your salary status is now unpaid.");
  }
  await audit(db, actor, "Salary updated", "salaries", id, "");
  return json({ ok: true });
}

async function holidayList(db: D1Database) {
  const rows = await db.prepare("SELECT id, name, holiday_date, description FROM holidays ORDER BY holiday_date").all();
  return json({ holidays: rows.results });
}

async function saveHoliday(db: D1Database, actor: AppUser, body: Record<string, unknown>) {
  const name = text(body.name);
  const holidayDate = text(body.holiday_date);
  if (!name || !holidayDate) return json({ error: "Holiday name and date are required" }, 400);
  const result = await db.prepare(
    `INSERT INTO holidays (name, holiday_date, description) VALUES (?, ?, ?)
     ON CONFLICT(holiday_date) DO UPDATE SET name = excluded.name, description = excluded.description`,
  ).bind(name, holidayDate, text(body.description)).run();
  await audit(db, actor, "Holiday saved", "holidays", result.meta.last_row_id, name);
  return json({ ok: true });
}

async function deleteHoliday(db: D1Database, actor: AppUser, id: number) {
  await db.prepare("DELETE FROM holidays WHERE id = ?").bind(id).run();
  await audit(db, actor, "Holiday deleted", "holidays", id, "");
  return json({ ok: true });
}

async function saveSettings(db: D1Database, actor: AppUser, body: Record<string, unknown>) {
  if (!text(body.company_name)) return json({ error: "Company name is required" }, 400);
  await db.prepare(
    `UPDATE company_settings SET company_name = ?, company_logo_url = ?, company_address = ?, working_days = ?, office_start_time = ?,
      office_end_time = ?, late_mark_time = ?, half_day_min_hours = ?, shift_min_hours = ?, deduct_absent_days = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
  ).bind(
    text(body.company_name),
    text(body.company_logo_url),
    text(body.company_address),
    text(body.working_days) || "Mon,Tue,Wed,Thu,Fri",
    text(body.office_start_time) || "09:30",
    text(body.office_end_time) || "18:30",
    text(body.late_mark_time) || "10:00",
    number(body.half_day_min_hours) || 4,
    number(body.shift_min_hours) || 8,
    number(body.deduct_absent_days) ? 1 : 0,
  ).run();
  await audit(db, actor, "Settings updated", "company_settings", 1, text(body.company_name));
  return json({ settings: await companySettings(db) });
}

async function auditLogs(db: D1Database) {
  const rows = await db.prepare(
    `SELECT a.*, u.email AS actor_email
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
     ORDER BY a.created_at DESC LIMIT 100`,
  ).all();
  return json({ logs: rows.results });
}

// ---- Daily task management ----

const taskPriorities = ["High", "Medium", "Low"];
const taskStatuses = ["Pending", "In Progress", "Completed"];

async function taskList(db: D1Database, user: AppUser, url: URL) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (user.role === "Employee") {
    conditions.push("t.employee_id = ?");
    params.push(user.employeeId);
  } else {
    const employeeId = url.searchParams.get("employeeId");
    if (employeeId) {
      conditions.push("t.employee_id = ?");
      params.push(employeeId);
    }
  }
  const date = url.searchParams.get("date");
  if (date) {
    conditions.push("t.task_date = ?");
    params.push(date);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.prepare(
    `SELECT t.*, e.full_name AS employee_name, e.employee_code
     FROM tasks t JOIN employees e ON e.id = t.employee_id
     ${where}
     ORDER BY CASE t.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, t.created_at ASC`,
  ).bind(...params).all();
  // Admins get the employee list for the filter dropdown.
  const employees = user.role === "Superadmin"
    ? (await db.prepare(employeeSelect("WHERE e.employment_status = 'Active' ORDER BY e.full_name")).all()).results
    : undefined;
  return json({ tasks: rows.results, employees });
}

async function createTask(db: D1Database, user: AppUser, body: Record<string, unknown>) {
  const title = text(body.title);
  if (!title) return json({ error: "Task title is required" }, 400);
  const date = text(body.task_date) || dateOnly();
  const priority = taskPriorities.includes(text(body.priority)) ? text(body.priority) : "Medium";

  let employeeId: number;
  let assignedByAdmin = 0;
  if (user.role === "Superadmin") {
    // Admin assigns a task to a chosen employee.
    employeeId = number(body.employee_id);
    const target = await db.prepare("SELECT id, user_id, full_name FROM employees WHERE id = ?").bind(employeeId).first<{ id: number; user_id: number; full_name: string }>();
    if (!target) return json({ error: "Choose a valid employee to assign the task to" }, 400);
    assignedByAdmin = 1;
  } else {
    const employee = await employeeForUser(db, user);
    employeeId = Number(employee.id);
  }

  await db.prepare(
    "INSERT INTO tasks (employee_id, task_date, title, company, priority, status, notes, assigned_by_admin, deadline) VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, ?)",
  ).bind(employeeId, date, title, text(body.company) || null, priority, text(body.notes) || null, assignedByAdmin, text(body.deadline) || null).run();

  if (assignedByAdmin) {
    const emp = await db.prepare("SELECT user_id FROM employees WHERE id = ?").bind(employeeId).first<{ user_id: number }>();
    if (emp?.user_id) await notify(db, emp.user_id, "New task assigned", `Admin assigned you a task for ${date}: ${title}`);
  }
  return json({ ok: true });
}

async function updateTask(db: D1Database, user: AppUser, id: number, body: Record<string, unknown>) {
  const task = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!task) return json({ error: "Task not found" }, 404);
  // Employees can only touch their own tasks; admins can edit any.
  if (user.role === "Employee" && Number(task.employee_id) !== user.employeeId) return json({ error: "Not allowed" }, 403);
  const title = body.title !== undefined ? (text(body.title) || String(task.title)) : String(task.title);
  const company = body.company !== undefined ? (text(body.company) || null) : (task.company ?? null);
  const priority = body.priority !== undefined && taskPriorities.includes(text(body.priority)) ? text(body.priority) : String(task.priority);
  const status = body.status !== undefined && taskStatuses.includes(text(body.status)) ? text(body.status) : String(task.status);
  const notes = body.notes !== undefined ? (text(body.notes) || null) : (task.notes ?? null);
  const deadline = body.deadline !== undefined ? (text(body.deadline) || null) : (task.deadline ?? null);
  await db.prepare(
    "UPDATE tasks SET title = ?, company = ?, priority = ?, status = ?, notes = ?, deadline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(title, company, priority, status, notes, deadline, id).run();
  return json({ ok: true });
}

// Delete is admin-only (route sits after the requireAdmin gate).
async function deleteTask(db: D1Database, actor: AppUser, id: number) {
  const task = await db.prepare("SELECT title FROM tasks WHERE id = ?").bind(id).first<{ title: string }>();
  await db.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
  await audit(db, actor, "Task deleted", "tasks", id, task?.title ?? "");
  return json({ ok: true });
}

// CSV report of tasks over a date range (admin: all employees; employee: own).
async function tasksCsv(db: D1Database, user: AppUser, url: URL) {
  const start = url.searchParams.get("start") || "1900-01-01";
  const end = url.searchParams.get("end") || "2999-12-31";
  const conditions = ["t.task_date BETWEEN ? AND ?"];
  const params: unknown[] = [start, end];
  if (user.role === "Employee") {
    conditions.push("t.employee_id = ?");
    params.push(user.employeeId);
  } else {
    const employeeId = url.searchParams.get("employeeId");
    if (employeeId) {
      conditions.push("t.employee_id = ?");
      params.push(employeeId);
    }
  }
  const rows = await db.prepare(
    `SELECT t.task_date, e.full_name AS employee_name, e.employee_code, t.title, t.company, t.priority, t.status, t.deadline
     FROM tasks t JOIN employees e ON e.id = t.employee_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.task_date DESC, CASE t.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END`,
  ).bind(...params).all<Record<string, unknown>>();
  const header = ["Date", "Employee", "Employee ID", "Task", "Company/Brand", "Priority", "Status", "Deadline"];
  const lines = rows.results.map((r) => [r.task_date, r.employee_name, r.employee_code, r.title, r.company, r.priority, r.status, r.deadline].map(csvCell).join(","));
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename=tasks_${start}_to_${end}.csv` },
  });
}

async function reportsMeta(db: D1Database) {
  const [employees, departments] = await Promise.all([
    db.prepare(employeeSelect("WHERE e.employment_status = 'Active' ORDER BY e.full_name")).all(),
    db.prepare("SELECT id, name FROM departments ORDER BY name").all(),
  ]);
  return json({ employees: employees.results, departments: departments.results });
}

async function leaveCsv(db: D1Database, url: URL) {
  const start = url.searchParams.get("start") || "1900-01-01";
  const end = url.searchParams.get("end") || "2999-12-31";
  const { where, params } = reportFilters("lr.start_date BETWEEN ? AND ?", [start, end], url);
  const rows = await db.prepare(
    `SELECT e.full_name, e.employee_code, d.name AS department_name, lt.name AS leave_type, lr.start_date, lr.end_date, lr.days, lr.status, lr.reason, lr.admin_note
     FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
     LEFT JOIN departments d ON d.id = e.department_id JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE ${where} ORDER BY lr.start_date DESC, e.full_name`,
  ).bind(...params).all<Record<string, unknown>>();
  const header = ["Employee", "Employee ID", "Department", "Leave type", "Start", "End", "Days", "Status", "Reason", "Admin note"];
  const lines = rows.results.map((row) => [row.full_name, row.employee_code, row.department_name, row.leave_type, row.start_date, row.end_date, row.days, row.status, row.reason, row.admin_note].map(csvCell).join(","));
  return csv("leave-report.csv", header, lines);
}

async function salaryCsv(db: D1Database, url: URL) {
  const month = Number(url.searchParams.get("month"));
  const year = Number(url.searchParams.get("year"));
  const { where, params } = reportFilters("s.salary_month = ? AND s.salary_year = ?", [month, year], url);
  const rows = await db.prepare(
    `SELECT e.full_name, e.employee_code, d.name AS department_name, s.working_days, s.paid_days, s.paid_leave_days, s.unpaid_leave_days,
      s.absent_days, s.gross_salary, s.deductions, s.net_salary, s.status
     FROM salaries s JOIN employees e ON e.id = s.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE ${where} ORDER BY e.full_name`,
  ).bind(...params).all<Record<string, unknown>>();
  const header = ["Employee", "Employee ID", "Department", "Working days", "Paid days", "Paid leave", "Unpaid leave", "Absent", "Gross", "Deductions", "Net", "Status"];
  const lines = rows.results.map((row) => [row.full_name, row.employee_code, row.department_name, row.working_days, row.paid_days, row.paid_leave_days, row.unpaid_leave_days, row.absent_days, row.gross_salary, row.deductions, row.net_salary, row.status].map(csvCell).join(","));
  return csv("salary-report.csv", header, lines);
}

function reportFilters(base: string, baseParams: unknown[], url: URL) {
  const params = [...baseParams];
  let where = base;
  const employeeId = url.searchParams.get("employeeId");
  const departmentId = url.searchParams.get("departmentId");
  if (employeeId) {
    where += " AND e.id = ?";
    params.push(employeeId);
  }
  if (departmentId) {
    where += " AND e.department_id = ?";
    params.push(departmentId);
  }
  return { where, params };
}

function csv(filename: string, header: string[], lines: string[]) {
  return new Response([header.join(","), ...lines].join("\n"), { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename=${filename}` } });
}

async function salarySlip(db: D1Database, user: AppUser, salaryId: number) {
  const salary = await db.prepare(
    `SELECT s.*, e.full_name, e.employee_code, e.monthly_salary, d.name AS department_name, des.name AS designation_name
     FROM salaries s JOIN employees e ON e.id = s.employee_id
     LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN designations des ON des.id = e.designation_id
     WHERE s.id = ?`,
  ).bind(salaryId).first<Record<string, unknown>>();
  if (!salary) return json({ error: "Salary not found" }, 404);
  if (user.role === "Employee" && Number(salary.employee_id) !== user.employeeId) return json({ error: "Not allowed" }, 403);
  // Always render fresh from current salary data so edits are reflected in the payslip.
  const settings = await companySettings(db);
  const slipHtml = slipTemplate(salary, salary, settings);
  await db.prepare("INSERT OR REPLACE INTO salary_slips (salary_id, slip_html, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").bind(salaryId, slipHtml).run();
  return html(slipHtml);
}

async function employeeForUser(db: D1Database, user: AppUser) {
  if (!user.employeeId) throw new Error("Employee profile not found");
  const employee = await db.prepare(employeeSelect("WHERE e.id = ?")).bind(user.employeeId).first();
  if (!employee) throw new Error("Employee profile not found");
  return employee as Record<string, string | number>;
}

function employeeSelect(suffix: string) {
  return `SELECT e.*, d.name AS department_name, des.name AS designation_name
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN designations des ON des.id = e.designation_id
    ${suffix}`;
}

async function companySettings(db: D1Database) {
  const settings = await db.prepare("SELECT * FROM company_settings WHERE id = 1").first<Record<string, string | number>>();
  if (!settings) throw new Error("Company settings are missing");
  return settings as Record<string, string> & { half_day_min_hours: number; deduct_absent_days: number; shift_min_hours: number };
}

async function upsertSlip(db: D1Database, salary: Record<string, unknown>, employee: Record<string, unknown>, settings: Record<string, unknown>) {
  const slipHtml = slipTemplate(salary, employee, settings);
  await db.prepare(
    `INSERT INTO salary_slips (salary_id, slip_html) VALUES (?, ?)
     ON CONFLICT(salary_id) DO UPDATE SET slip_html = excluded.slip_html, updated_at = CURRENT_TIMESTAMP`,
  ).bind(salary.id, slipHtml).run();
}

function slipTemplate(salary: Record<string, unknown>, employee: Record<string, unknown>, settings: Record<string, unknown>) {
  const month = monthName(Number(salary.salary_month));
  const year = salary.salary_year;
  const rows = [
    ["Employee name", employee.full_name],
    ["Employee ID", employee.employee_code],
    ["Department", employee.department_name || "-"],
    ["Designation", employee.designation_name || "-"],
    ["Month", `${month} ${year}`],
    ["Monthly salary", money(Number(salary.gross_salary))],
    ["Total working days", salary.working_days],
    ["Paid days", salary.paid_days],
    ["Paid leave days", salary.paid_leave_days],
    ["Unpaid leave days", salary.unpaid_leave_days],
    ["Absent days", salary.absent_days],
    ["Gross salary", money(Number(salary.gross_salary))],
    ["Deductions", money(Number(salary.deductions))],
    ["Net payable salary", money(Number(salary.net_salary))],
    ["Salary status", salary.status],
    ["Generated date", dateOnly()],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Salary Slip</title><style>
    body{font-family:Inter,Arial,sans-serif;color:#172033;margin:0;background:#f7fafc}.sheet{max-width:820px;margin:24px auto;background:white;border:1px solid #dbe4ef;padding:32px}
    h1{margin:0;font-size:28px}.muted{color:#64748b}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #dbe4ef;padding-bottom:20px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e8eef5;padding:12px}.label{font-weight:700;color:#475569}.net{font-size:22px;font-weight:800;color:#1677c8}
    @media print{body{background:white}.sheet{border:0;margin:0;max-width:none}}</style></head><body><main class="sheet">
    <div class="top"><div><h1>${escapeHtml(String(settings.company_name))}</h1><p class="muted">${escapeHtml(String(settings.company_address || ""))}</p></div><div><strong>Salary Slip</strong><p class="muted">${month} ${year}</p></div></div>
    <table>${rows.map(([label, value]) => `<tr><td class="label">${escapeHtml(String(label))}</td><td${label === "Net payable salary" ? ' class="net"' : ""}>${escapeHtml(String(value ?? "-"))}</td></tr>`).join("")}</table>
    <p class="muted">This slip is generated dynamically from Fast HRMS payroll data.</p></main><script>window.print()</script></body></html>`;
}

async function leaveDays(db: D1Database, employeeId: number, month: number, year: number, paid: boolean) {
  const monthValue = `${year}-${pad(month)}`;
  return scalar(
    db,
    `SELECT COALESCE(SUM(lr.days), 0) FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE lr.employee_id = ? AND lr.status = 'Approved' AND lt.is_paid = ? AND substr(lr.start_date, 1, 7) = ?`,
    employeeId,
    paid ? 1 : 0,
    monthValue,
  );
}

async function scalar(db: D1Database, sql: string, ...params: unknown[]) {
  const row = await db.prepare(sql).bind(...params).first<Record<string, number>>();
  return Number(Object.values(row ?? { value: 0 })[0] ?? 0);
}

async function audit(db: D1Database, actor: AppUser, action: string, entity: string, id: number | undefined, details: string) {
  await db.prepare("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)")
    .bind(actor.id, action, entity, id ?? null, details).run();
}

async function notify(db: D1Database, userId: number, title: string, message: string) {
  await db.prepare("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)").bind(userId, title, message).run();
}

function requireAdmin(user: AppUser) {
  if (user.role !== "Superadmin") throw new Error("Superadmin access required");
}

function validateEmployee(body: Record<string, unknown>) {
  for (const key of ["employee_code", "full_name", "email", "joining_date"]) {
    if (!text(body[key])) throw new Error(`${key.replace("_", " ")} is required`);
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  return await request.json<Record<string, unknown>>().catch(() => ({}));
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...headers } });
}

function html(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function cookie(request: Request, name: string) {
  const header = request.headers.get("Cookie") ?? "";
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function compactUser(row: Record<string, string | number>): AppUser {
  return {
    id: Number(row.id),
    email: String(row.email),
    role: row.role as AppUser["role"],
    employeeId: row.employeeId ? Number(row.employeeId) : undefined,
    employeeName: row.employeeName ? String(row.employeeName) : undefined,
  };
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const key = await crypto.subtle.importKey("raw", encoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${hex(salt)}$${hex(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string) {
  const [method, iterationsText, saltHex, hashHex] = stored.split("$");
  if (method !== "pbkdf2") return false;
  const salt = fromHex(saltHex);
  const key = await crypto.subtle.importKey("raw", encoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(iterationsText) }, key, 256);
  return hex(new Uint8Array(bits)) === hashHex;
}

async function signSession(user: AppUser, secret = "dev-fast-hrms-secret") {
  const payload = base64url(JSON.stringify(user));
  return `${payload}.${await hmac(payload, secret)}`;
}

async function verifySession(token: string, secret = "dev-fast-hrms-secret") {
  const [payload, signature] = token.split(".");
  if (!payload || signature !== await hmac(payload, secret)) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as AppUser;
  } catch {
    return null;
  }
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder().encode(value))));
}

function base64url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encoder() {
  return new TextEncoder();
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown) {
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
// Attendance rules (late mark, shift hours) are configured in local Indian time,
// but Workers run in UTC — format all dates/times in IST so they match.
const timeZone = "Asia/Kolkata";

function dateOnly(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function timeOnly(date = new Date()) {
  // Seconds precision so the client work timer starts from zero at check-in.
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function inclusiveDays(start: string, end: string) {
  return Math.floor((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
}

function toSeconds(value: string) {
  const [h = 0, m = 0, s = 0] = value.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function hoursBetween(start: string, end: string) {
  return Math.max(0, Math.round(((toSeconds(end) - toSeconds(start)) / 3600) * 100) / 100);
}

function workingDayCount(year: number, month: number, workingDays: string) {
  const allowed = new Set(workingDays.split(",").map((item) => item.trim()));
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= days; day += 1) {
    if (allowed.has(labels[new Date(Date.UTC(year, month - 1, day)).getUTCDay()])) count += 1;
  }
  return count;
}

function monthName(month: number) {
  return new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, month - 1, 1)));
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}
