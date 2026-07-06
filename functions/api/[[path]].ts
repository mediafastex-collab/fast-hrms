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
  // params.path is an array of segments for [[path]] catch-all routes.
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
  if (method === "POST" && path === "/attendance/break-start") return takeBreak(db, user, await readBody(context.request));
  if (method === "POST" && path === "/attendance/break-end") return endBreak(db, user);
  if (method === "GET" && path === "/leaves") return leaveList(db, user);
  if (method === "POST" && path === "/leaves") return applyLeave(db, user, await readBody(context.request));
  if (method === "GET" && path === "/attendance-requests") return attendanceRequestList(db, user);
  if (method === "POST" && path === "/attendance-requests") return createAttendanceRequest(db, user, await readBody(context.request));
  if (method === "GET" && path === "/profile-requests") return profileRequestList(db, user);
  if (method === "POST" && path === "/profile-requests") return createProfileRequest(db, user, await readBody(context.request));
  if (method === "GET" && path === "/payroll") return payrollList(db, user, url);
  if (method === "GET" && path.startsWith("/salary-slips/")) return salarySlip(db, user, Number(path.split("/").pop()));
  if (method === "GET" && path === "/holidays") return holidayList(db);
  if (method === "GET" && path === "/settings") return json({ settings: await companySettings(db) });
  if (method === "GET" && path === "/notifications") return notificationsList(db, user);
  if (method === "POST" && path === "/notifications/read-all") return markNotificationsRead(db, user);

  if (user.role !== "Superadmin") return json({ error: "Superadmin access required" }, 403);

  if (method === "GET" && path === "/admin/summary") return adminSummary(db);
  if (method === "GET" && path === "/employees") return employeesList(db);
  if (method === "POST" && path === "/employees") return saveEmployee(db, user, await readBody(context.request));
  if (method === "PUT" && path.startsWith("/employees/")) return updateEmployee(db, user, Number(path.split("/").pop()), await readBody(context.request));
  if (method === "POST" && path === "/departments") return createNamed(db, user, "departments", await readBody(context.request));
  if (method === "PUT" && path.startsWith("/departments/")) return updateDepartment(db, user, Number(path.split("/").pop()), await readBody(context.request));
  if (method === "POST" && path === "/designations") return createNamed(db, user, "designations", await readBody(context.request));
  if (method === "PUT" && path.startsWith("/designations/")) return updateDesignation(db, user, Number(path.split("/").pop()), await readBody(context.request));
  if (method === "DELETE" && path.startsWith("/departments/")) return deleteNamed(db, "departments", "department_id", Number(path.split("/").pop()));
  if (method === "DELETE" && path.startsWith("/designations/")) return deleteNamed(db, "designations", "designation_id", Number(path.split("/").pop()));
  if (method === "POST" && path === "/attendance/manual") return manualAttendance(db, user, await readBody(context.request));
  if (method === "POST" && path.match(/^\/leaves\/\d+\/decision$/)) return decideLeave(db, user, Number(path.split("/")[2]), await readBody(context.request));
  if (method === "POST" && path.match(/^\/attendance-requests\/\d+\/decision$/)) return decideAttendanceRequest(db, user, Number(path.split("/")[2]), await readBody(context.request));
  if (method === "POST" && path.match(/^\/profile-requests\/\d+\/decision$/)) return decideProfileRequest(db, user, Number(path.split("/")[2]), await readBody(context.request));
  if (method === "POST" && path.match(/^\/employees\/\d+\/active$/)) return toggleEmployeeActive(db, user, Number(path.split("/")[2]), await readBody(context.request));
  if (method === "POST" && path === "/leave-types") return saveLeaveType(db, user, await readBody(context.request));
  if (method === "DELETE" && path.startsWith("/leave-types/")) return deleteLeaveType(db, user, Number(path.split("/").pop()));
  if (method === "POST" && path === "/payroll/generate") return generatePayroll(db, user, await readBody(context.request));
  if (method === "PUT" && path.startsWith("/payroll/")) return updateSalary(db, user, Number(path.split("/").pop()), await readBody(context.request));
  if (method === "POST" && path === "/holidays") return saveHoliday(db, user, await readBody(context.request));
  if (method === "DELETE" && path.startsWith("/holidays/")) return deleteHoliday(db, user, Number(path.split("/").pop()));
  if (method === "PUT" && path === "/settings") return saveSettings(db, user, await readBody(context.request));
  if (method === "GET" && path === "/audit-logs") return auditLogs(db);

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
    db.prepare("SELECT id, name, shift_min_hours, half_day_min_hours, late_mark_time FROM departments ORDER BY name").all(),
    db.prepare("SELECT id, name FROM designations ORDER BY name").all(),
  ]);
  return { departments: departments.results, designations: designations.results };
}

// Resolve the shift rules that apply to an employee: department overrides, else company defaults.
async function effectiveShift(db: D1Database, employee: Record<string, unknown>) {
  const settings = await companySettings(db);
  let dept: Record<string, unknown> | null = null;
  if (employee.department_id) {
    dept = await db.prepare("SELECT shift_min_hours, half_day_min_hours, late_mark_time FROM departments WHERE id = ?").bind(employee.department_id).first();
  }
  return {
    shift_min_hours: Number(dept?.shift_min_hours ?? settings.shift_min_hours),
    half_day_min_hours: Number(dept?.half_day_min_hours ?? settings.half_day_min_hours),
    late_mark_time: String(dept?.late_mark_time ?? settings.late_mark_time),
  };
}

async function updateDepartment(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  const existing = await db.prepare("SELECT id FROM departments WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "Department not found" }, 404);
  const name = text(body.name);
  if (!name) return json({ error: "Name is required" }, 400);
  await db.prepare(
    "UPDATE departments SET name = ?, shift_min_hours = ?, half_day_min_hours = ?, late_mark_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(
    name,
    body.shift_min_hours === "" || body.shift_min_hours == null ? null : number(body.shift_min_hours),
    body.half_day_min_hours === "" || body.half_day_min_hours == null ? null : number(body.half_day_min_hours),
    text(body.late_mark_time) || null,
    id,
  ).run();
  await audit(db, actor, "Department updated", "departments", id, name);
  return json({ ok: true });
}

async function updateDesignation(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  const existing = await db.prepare("SELECT id FROM designations WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "Designation not found" }, 404);
  const name = text(body.name);
  if (!name) return json({ error: "Name is required" }, 400);
  await db.prepare(
    "UPDATE designations SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(name, id).run();
  await audit(db, actor, "Designation updated", "designations", id, name);
  return json({ ok: true });
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
  const month = Number(today.slice(5, 7));
  const year = Number(today.slice(0, 4));
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-31`;
  const horizon = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const [todayAttendance, attendanceRows, upcomingLeaves, upcomingHolidays] = await Promise.all([
    db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?").bind(employee.id, today).first(),
    db.prepare("SELECT status, COUNT(*) AS count FROM attendance WHERE employee_id = ? AND attendance_date BETWEEN ? AND ? GROUP BY status").bind(employee.id, monthStart, monthEnd).all(),
    // Only approved leave that hasn't finished yet.
    db.prepare(
      `SELECT lr.*, lt.name AS leave_type_name, lt.is_paid
       FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.employee_id = ? AND lr.status = 'Approved' AND lr.end_date >= ? ORDER BY lr.start_date ASC LIMIT 5`,
    ).bind(employee.id, today).all(),
    // Company holidays within the next 15 days.
    db.prepare("SELECT id, name, holiday_date, description FROM holidays WHERE holiday_date BETWEEN ? AND ? ORDER BY holiday_date").bind(today, horizon).all(),
  ]);
  const monthAttendance = { present: 0, late: 0, halfDay: 0, absent: 0 };
  for (const row of attendanceRows.results as Array<{ status: string; count: number }>) {
    if (row.status === "Present") monthAttendance.present = row.count;
    if (row.status === "Late") monthAttendance.late = row.count;
    if (row.status === "Half Day") monthAttendance.halfDay = row.count;
    if (row.status === "Absent") monthAttendance.absent = row.count;
  }
  const shiftConfig = await effectiveShift(db, employee);
  return json({ summary: { todayAttendance, monthAttendance, upcomingLeaves: upcomingLeaves.results, upcomingHolidays: upcomingHolidays.results, shiftConfig } });
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
      employment_status, address, bank_name, account_number, ifsc_code, aadhaar_doc, pan_doc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, text(body.employee_code), text(body.full_name), email, text(body.phone), numOrNull(body.department_id), numOrNull(body.designation_id), text(body.joining_date), number(body.monthly_salary), text(body.employment_status) || "Active", text(body.address), text(body.bank_name), text(body.account_number), text(body.ifsc_code), docOrNull(body.aadhaar_doc), docOrNull(body.pan_doc))
    .run();
  await audit(db, actor, "Employee added", "employees", result.meta.last_row_id, text(body.full_name));
  return json({ ok: true });
}

async function updateEmployee(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  validateEmployee(body);
  const existing = await db.prepare("SELECT user_id FROM employees WHERE id = ?").bind(id).first<{ user_id: number }>();
  if (!existing) return json({ error: "Employee not found" }, 404);
  const statusVal = text(body.employment_status) || "Active";
  // Keep existing document if the edit form didn't send a new one.
  const current = await db.prepare("SELECT aadhaar_doc, pan_doc FROM employees WHERE id = ?").bind(id).first<{ aadhaar_doc: string | null; pan_doc: string | null }>();
  const aadhaar = body.aadhaar_doc !== undefined ? docOrNull(body.aadhaar_doc) : current?.aadhaar_doc ?? null;
  const pan = body.pan_doc !== undefined ? docOrNull(body.pan_doc) : current?.pan_doc ?? null;
  await db.prepare(
    `UPDATE employees SET employee_code = ?, full_name = ?, email = ?, phone = ?, department_id = ?, designation_id = ?, joining_date = ?,
      monthly_salary = ?, employment_status = ?, address = ?, bank_name = ?, account_number = ?, ifsc_code = ?, aadhaar_doc = ?, pan_doc = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(text(body.employee_code), text(body.full_name), text(body.email).toLowerCase(), text(body.phone), numOrNull(body.department_id), numOrNull(body.designation_id), text(body.joining_date), number(body.monthly_salary), statusVal, text(body.address), text(body.bank_name), text(body.account_number), text(body.ifsc_code), aadhaar, pan, id)
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
    `SELECT a.*, e.full_name AS employee_name, e.employee_code, d.name AS department_name,
       COALESCE(d.shift_min_hours, cs.shift_min_hours) AS shift_min_hours,
       COALESCE(d.half_day_min_hours, cs.half_day_min_hours) AS half_day_min_hours
     FROM attendance a JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN company_settings cs ON cs.id = 1
     ${where} ORDER BY a.attendance_date DESC, e.full_name`,
  ).bind(...params).all();
  return result.results;
}

async function checkIn(db: D1Database, user: AppUser, body: Record<string, unknown>) {
  const employee = await employeeForUser(db, user);
  const shift = await effectiveShift(db, employee);
  const time = timeOnly();
  const status = time.slice(0, 5) > shift.late_mark_time ? "Late" : "Present";
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
  const shift = await effectiveShift(db, employee);
  const checkOutTime = timeOnly();
  let hours = hoursBetween(current.check_in, checkOutTime);
  if (current.break_start && current.break_end) {
    hours = Math.max(0, hours - hoursBetween(current.break_start, current.break_end));
  }
  const status = hours < shift.half_day_min_hours ? "Half Day" : current.status;
  const reason = text(body.early_checkout_reason) || null;
  await db.prepare("UPDATE attendance SET check_out = ?, total_hours = ?, status = ?, early_checkout_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(checkOutTime, hours, status, reason, current.id).run();
  return json({ ok: true });
}

async function takeBreak(db: D1Database, user: AppUser, body: Record<string, unknown>) {
  const employee = await employeeForUser(db, user);
  const current = await db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?").bind(employee.id, dateOnly()).first<Record<string, string>>();
  if (!current?.check_in) return json({ error: "Check in first" }, 400);
  if (current.check_out) return json({ error: "You have already checked out today" }, 400);
  if (current.break_start) return json({ error: "You are already on a break or took one" }, 400);
  const reason = text(body.break_reason);
  if (!reason) return json({ error: "Break reason is required" }, 400);
  await db.prepare("UPDATE attendance SET break_start = ?, break_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(timeOnly(), reason, current.id).run();
  return json({ ok: true });
}

async function endBreak(db: D1Database, user: AppUser) {
  const employee = await employeeForUser(db, user);
  const current = await db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?").bind(employee.id, dateOnly()).first<Record<string, string>>();
  if (!current?.break_start) return json({ error: "You are not on a break" }, 400);
  if (current.break_end) return json({ error: "Break already ended" }, 400);
  await db.prepare("UPDATE attendance SET break_end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(timeOnly(), current.id).run();
  return json({ ok: true });
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
  const start = text(body.start_date);
  const end = text(body.end_date);
  if (!start || !end) return json({ error: "Start and end dates are required" }, 400);
  const range = datesInRange(start, end);
  if (!range.length) return json({ error: "End date must be on or after the start date" }, 400);
  const leaveType = await db.prepare("SELECT id, name FROM leave_types WHERE id = ?").bind(number(body.leave_type_id)).first<{ id: number; name: string }>();
  if (!leaveType) return json({ error: "Choose a valid leave type" }, 400);
  // Per-day half/full breakdown; default every day to full.
  const parts = (body.day_breakdown && typeof body.day_breakdown === "object" ? body.day_breakdown : {}) as Record<string, unknown>;
  const breakdown: Record<string, string> = {};
  let days = 0;
  for (const date of range) {
    const part = String(parts[date] ?? "full") === "half" ? "half" : "full";
    breakdown[date] = part;
    days += part === "half" ? 0.5 : 1;
  }
  if (days < 0.5) return json({ error: "Select at least half a day" }, 400);
  const result = await db.prepare("INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days, reason, day_breakdown) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(employee.id, leaveType.id, start, end, days, text(body.reason), JSON.stringify(breakdown)).run();
  await notify(db, user.id, "Leave applied", `Your ${leaveType.name} request for ${start} to ${end} (${days} day${days === 1 ? "" : "s"}) was submitted.`);
  await notifyAdmins(db, "New leave request", `${employee.full_name} applied for ${leaveType.name} (${start} to ${end}, ${days} day${days === 1 ? "" : "s"}).`);
  return json({ ok: true, id: result.meta.last_row_id });
}

async function decideLeave(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  const status = text(body.status);
  if (!["Approved", "Rejected"].includes(status)) return json({ error: "Invalid leave status" }, 400);
  const target = await db.prepare(
    "SELECT e.user_id, lr.start_date, lr.end_date FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id WHERE lr.id = ?",
  ).bind(id).first<{ user_id: number; start_date: string; end_date: string }>();
  if (!target) return json({ error: "Leave request not found" }, 404);
  await db.prepare("UPDATE leave_requests SET status = ?, admin_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, text(body.admin_note), actor.id, id).run();
  await notify(db, target.user_id, `Leave ${status.toLowerCase()}`, `Your leave request for ${target.start_date} to ${target.end_date} was ${status.toLowerCase()}.`);
  await audit(db, actor, `Leave ${status.toLowerCase()}`, "leave_requests", id, text(body.admin_note));
  return json({ ok: true });
}

// ---- Attendance change / regularisation requests ----

async function attendanceRequestList(db: D1Database, user: AppUser) {
  const where = user.role === "Employee" ? "WHERE ar.employee_id = ?" : "";
  const bind = user.role === "Employee" ? [user.employeeId] : [];
  const rows = await db.prepare(
    `SELECT ar.*, e.full_name AS employee_name, e.employee_code
     FROM attendance_requests ar JOIN employees e ON e.id = ar.employee_id
     ${where} ORDER BY (ar.status = 'Pending') DESC, ar.created_at DESC`,
  ).bind(...bind).all();
  return json({ requests: rows.results });
}

async function createAttendanceRequest(db: D1Database, user: AppUser, body: Record<string, unknown>) {
  const employee = await employeeForUser(db, user);
  const date = text(body.attendance_date);
  if (!date) return json({ error: "Attendance date is required" }, 400);
  const checkIn = text(body.requested_check_in) || null;
  const checkOut = text(body.requested_check_out) || null;
  if (!checkIn && !checkOut) return json({ error: "Provide a requested check-in or check-out time" }, 400);
  const result = await db.prepare(
    "INSERT INTO attendance_requests (employee_id, attendance_date, requested_check_in, requested_check_out, reason) VALUES (?, ?, ?, ?, ?)",
  ).bind(employee.id, date, checkIn, checkOut, text(body.reason)).run();
  await notify(db, user.id, "Attendance request submitted", `Your attendance change for ${date} is pending approval.`);
  await notifyAdmins(db, "New attendance request", `${employee.full_name} requested an attendance change for ${date}.`);
  return json({ ok: true, id: result.meta.last_row_id });
}

async function decideAttendanceRequest(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  const status = text(body.status);
  if (!["Approved", "Rejected"].includes(status)) return json({ error: "Invalid status" }, 400);
  const req = await db.prepare(
    "SELECT ar.*, e.user_id FROM attendance_requests ar JOIN employees e ON e.id = ar.employee_id WHERE ar.id = ?",
  ).bind(id).first<Record<string, unknown>>();
  if (!req) return json({ error: "Request not found" }, 404);
  if (req.status !== "Pending") return json({ error: "This request was already decided" }, 400);

  if (status === "Approved") {
    // Apply the requested times onto the attendance record for that day.
    const employeeId = Number(req.employee_id);
    const date = String(req.attendance_date);
    const existing = await db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?").bind(employeeId, date).first<Record<string, string>>();
    const checkIn = (req.requested_check_in as string) || existing?.check_in || "";
    const checkOut = (req.requested_check_out as string) || existing?.check_out || "";
    const breakStart = existing?.break_start || null;
    const breakEnd = existing?.break_end || null;
    let hours = checkIn && checkOut ? hoursBetween(checkIn, checkOut) : Number(existing?.total_hours ?? 0);
    if (breakStart && breakEnd) hours = Math.max(0, hours - hoursBetween(breakStart, breakEnd));
    const employeeRow = await db.prepare(employeeSelect("WHERE e.id = ?")).bind(employeeId).first<Record<string, unknown>>();
    const shift = employeeRow ? await effectiveShift(db, employeeRow) : { half_day_min_hours: 4 };
    const attStatus = checkIn && checkOut ? (hours < shift.half_day_min_hours ? "Half Day" : "Present") : (existing?.status || "Present");
    await db.prepare(
      `INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, break_start, break_end, total_hours, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, attendance_date) DO UPDATE SET check_in = excluded.check_in, check_out = excluded.check_out,
         total_hours = excluded.total_hours, status = excluded.status, updated_at = CURRENT_TIMESTAMP`,
    ).bind(employeeId, date, checkIn || null, checkOut || null, breakStart, breakEnd, hours, attStatus).run();
  }

  await db.prepare("UPDATE attendance_requests SET status = ?, admin_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, text(body.admin_note), actor.id, id).run();
  await notify(db, Number(req.user_id), `Attendance request ${status.toLowerCase()}`, `Your attendance change for ${req.attendance_date} was ${status.toLowerCase()}.`);
  await audit(db, actor, `Attendance request ${status.toLowerCase()}`, "attendance_requests", id, String(req.attendance_date));
  return json({ ok: true });
}

// ---- Profile change requests ----

const editableProfileFields = ["phone", "address", "bank_name", "account_number", "ifsc_code"] as const;

async function profileRequestList(db: D1Database, user: AppUser) {
  const where = user.role === "Employee" ? "WHERE pr.employee_id = ?" : "";
  const bind = user.role === "Employee" ? [user.employeeId] : [];
  const rows = await db.prepare(
    `SELECT pr.*, e.full_name AS employee_name, e.employee_code
     FROM profile_requests pr JOIN employees e ON e.id = pr.employee_id
     ${where} ORDER BY (pr.status = 'Pending') DESC, pr.created_at DESC`,
  ).bind(...bind).all();
  return json({ requests: rows.results });
}

async function createProfileRequest(db: D1Database, user: AppUser, body: Record<string, unknown>) {
  const employee = await employeeForUser(db, user);
  const payload: Record<string, string> = {};
  for (const field of editableProfileFields) {
    if (body[field] !== undefined) payload[field] = text(body[field]);
  }
  if (!Object.keys(payload).length) return json({ error: "Nothing to update" }, 400);
  const result = await db.prepare("INSERT INTO profile_requests (employee_id, payload) VALUES (?, ?)")
    .bind(employee.id, JSON.stringify(payload)).run();
  await notify(db, user.id, "Profile update submitted", "Your profile changes are pending approval.");
  await notifyAdmins(db, "New profile update request", `${employee.full_name} requested profile changes.`);
  return json({ ok: true, id: result.meta.last_row_id });
}

async function decideProfileRequest(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  const status = text(body.status);
  if (!["Approved", "Rejected"].includes(status)) return json({ error: "Invalid status" }, 400);
  const req = await db.prepare(
    "SELECT pr.*, e.user_id FROM profile_requests pr JOIN employees e ON e.id = pr.employee_id WHERE pr.id = ?",
  ).bind(id).first<Record<string, unknown>>();
  if (!req) return json({ error: "Request not found" }, 404);
  if (req.status !== "Pending") return json({ error: "This request was already decided" }, 400);

  if (status === "Approved") {
    const payload = JSON.parse(String(req.payload)) as Record<string, string>;
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const field of editableProfileFields) {
      if (payload[field] !== undefined) {
        sets.push(`${field} = ?`);
        values.push(payload[field]);
      }
    }
    if (sets.length) {
      values.push(Number(req.employee_id));
      await db.prepare(`UPDATE employees SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values).run();
    }
  }

  await db.prepare("UPDATE profile_requests SET status = ?, admin_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, text(body.admin_note), actor.id, id).run();
  await notify(db, Number(req.user_id), `Profile update ${status.toLowerCase()}`, `Your profile changes were ${status.toLowerCase()}.`);
  await audit(db, actor, `Profile update ${status.toLowerCase()}`, "profile_requests", id, "");
  return json({ ok: true });
}

async function toggleEmployeeActive(db: D1Database, actor: AppUser, id: number, body: Record<string, unknown>) {
  const employee = await db.prepare("SELECT user_id, full_name FROM employees WHERE id = ?").bind(id).first<{ user_id: number; full_name: string }>();
  if (!employee) return json({ error: "Employee not found" }, 404);
  const active = number(body.active) ? 1 : 0;
  await db.prepare("UPDATE employees SET employment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(active ? "Active" : "Inactive", id).run();
  if (employee.user_id) await db.prepare("UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(active, employee.user_id).run();
  await audit(db, actor, active ? "Employee activated" : "Employee deactivated", "employees", id, employee.full_name);
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
  const conditions: string[] = [];
  const params: unknown[] = [];
  const period = url.searchParams.get("period") || "Last 6 Months";
  const month = Number(url.searchParams.get("month"));
  const year = Number(url.searchParams.get("year"));

  if (user.role === "Employee") {
    conditions.push("s.employee_id = ?");
    params.push(user.employeeId);
  }

  // A specific month, or a rolling window of the most recent N months.
  const monthsForPeriod = period === "Last Month" ? 1 : period === "Last 3 Months" ? 3 : 6;
  let orderLimit = " ORDER BY s.salary_year DESC, s.salary_month DESC, e.full_name ASC";
  if (period === "Custom" && month && year) {
    conditions.push("s.salary_month = ? AND s.salary_year = ?");
    params.push(month, year);
  } else {
    // Keep only salaries whose (year*12+month) is within the last N months.
    const todayStr = dateOnly();
    const cutoffIndex = Number(todayStr.slice(0, 4)) * 12 + Number(todayStr.slice(5, 7)) - monthsForPeriod;
    conditions.push("(s.salary_year * 12 + s.salary_month) > ?");
    params.push(cutoffIndex);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.prepare(
    `SELECT s.*, e.full_name AS employee_name, e.employee_code
     FROM salaries s JOIN employees e ON e.id = s.employee_id
     ${where}${orderLimit}`,
  ).bind(...params).all();
  return json({ salaries: rows.results });
}

async function generatePayroll(db: D1Database, actor: AppUser, body: Record<string, unknown>) {
  const month = number(body.month);
  const year = number(body.year);
  // Payroll can only be run for completed (past) months — not the current or any future month.
  const todayStr = dateOnly();
  const curYear = Number(todayStr.slice(0, 4));
  const curMonth = Number(todayStr.slice(5, 7));
  if (year > curYear || (year === curYear && month >= curMonth)) {
    return json({ error: "Payroll can only be generated for completed (past) months." }, 400);
  }
  const settings = await companySettings(db);
  const workingDays = workingDayCount(year, month, settings.working_days);
  const employees = await db.prepare(employeeSelect("WHERE e.employment_status = 'Active' ORDER BY e.full_name")).all<Record<string, number | string>>();
  for (const employee of employees.results) {
    const employeeId = Number(employee.id);
    const paidLeaveDays = await leaveDays(db, employeeId, month, year, true);
    const unpaidLeaveDays = await leaveDays(db, employeeId, month, year, false);
    const absentDays = settings.deduct_absent_days ? await scalar(db, "SELECT COUNT(*) FROM attendance WHERE employee_id = ? AND status = 'Absent' AND strftime('%w', attendance_date) != '0' AND strftime('%m', attendance_date) = ? AND strftime('%Y', attendance_date) = ?", employeeId, pad(month), String(year)) : 0;
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
  // UI uses Paid/Unpaid/Generated; the column stores Done/Pending.
  const raw = text(body.status);
  const status = raw === "Paid" ? "Done" : (raw === "Unpaid" || raw === "Generated") ? "Pending" : raw;
  if (status && !["Pending", "Done"].includes(status)) return json({ error: "Invalid salary status" }, 400);

  // Get current record to find employee
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
    `UPDATE salaries SET status = ?, working_days = ?, paid_days = ?, gross_salary = ?, deductions = ?, net_salary = ?, ${proofProvided ? "payment_proof = ?," : ""} updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(...(proofProvided
    ? [newStatus, workingDays, paidDays, grossSalary, deductions, netSalary, proofValue, id]
    : [newStatus, workingDays, paidDays, grossSalary, deductions, netSalary, id])).run();

  const updatedSalary = await db.prepare("SELECT * FROM salaries WHERE id = ?").bind(id).first<Record<string, unknown>>();
  const employee = await db.prepare(employeeSelect("WHERE e.id = ?")).bind(existing.employee_id).first<Record<string, unknown>>();
  const settings = await companySettings(db);

  if (updatedSalary && employee) {
    await upsertSlip(db, updatedSalary, employee, settings);
  }

  if (status && status !== existing.status) {
    const label = status === "Done" ? "Paid" : "Unpaid";
    await notify(db, Number(existing.user_id), `Salary marked ${label.toLowerCase()}`, label === "Paid" ? "Your salary is marked paid — your payslip is now available." : `Your salary status is now ${label}.`);
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

async function salarySlip(db: D1Database, user: AppUser, salaryId: number) {
  const salary = await db.prepare(
    `SELECT s.*, e.full_name, e.employee_code, e.monthly_salary, d.name AS department_name, des.name AS designation_name
     FROM salaries s JOIN employees e ON e.id = s.employee_id
     LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN designations des ON des.id = e.designation_id
     WHERE s.id = ?`,
  ).bind(salaryId).first<Record<string, unknown>>();
  if (!salary) return json({ error: "Salary not found" }, 404);
  if (user.role === "Employee" && Number(salary.employee_id) !== user.employeeId) return json({ error: "Not allowed" }, 403);
  // Payslips are only issued once the salary is marked Paid.
  if (String(salary.status) !== "Done") return json({ error: "Payslip is available only after the salary is marked paid." }, 400);
  // Always render fresh from current data so salary edits and template updates are reflected.
  const settings = await companySettings(db);
  return html(slipTemplate(salary, salary, settings));
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
  const gross = Number(salary.gross_salary);
  const deductions = Number(salary.deductions);
  const net = Number(salary.net_salary);
  const initials = String(employee.full_name || "?").split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const meta = [
    ["Employee name", employee.full_name],
    ["Employee ID", employee.employee_code],
    ["Department", employee.department_name || "-"],
    ["Designation", employee.designation_name || "-"],
    ["Pay period", `${month} ${year}`],
    ["Status", salary.status === "Done" ? "Paid" : "Unpaid"],
  ];
  const attendance = [
    ["Total working days", salary.working_days],
    ["Paid days", salary.paid_days],
    ["Paid leave", salary.paid_leave_days],
    ["Unpaid leave", salary.unpaid_leave_days],
    ["Absent days", salary.absent_days],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${escapeHtml(String(employee.employee_code || ""))} ${month} ${year}</title><style>
    *{box-sizing:border-box}body{font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;background:#eef2f7;padding:24px}
    .sheet{max-width:800px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,.08)}
    .bar{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;padding:28px 32px;display:flex;justify-content:space-between;align-items:center;gap:16px}
    .bar h1{margin:0;font-size:22px}.bar p{margin:4px 0 0;opacity:.85;font-size:13px}.tag{background:rgba(255,255,255,.18);padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700}
    .body{padding:28px 32px}.who{display:flex;align-items:center;gap:16px;margin-bottom:24px}
    .avatar{width:56px;height:56px;border-radius:14px;background:#ffedd5;color:#c2410c;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 32px;margin-bottom:24px}
    .row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #eef2f7;font-size:14px}.row span:first-child{color:#64748b}.row span:last-child{font-weight:600}
    h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:24px 0 8px}
    .totals{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-top:8px}
    .totals .row{border:0;padding:6px 0}.net{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:14px;border-top:2px dashed #cbd5e1}
    .net span:first-child{font-weight:700}.net span:last-child{font-size:24px;font-weight:800;color:#ea580c}
    .foot{padding:18px 32px;border-top:1px solid #eef2f7;color:#94a3b8;font-size:12px;display:flex;justify-content:space-between}
    .noprint{position:fixed;top:16px;right:16px}.btn{background:#ea580c;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 4px 14px rgba(234,88,12,.35)}
    @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none}.noprint{display:none}}
  </style></head><body>
    <button class="btn noprint" onclick="window.print()">⬇ Download PDF</button>
    <main class="sheet">
      <div class="bar"><div><h1>${escapeHtml(String(settings.company_name))}</h1><p>${escapeHtml(String(settings.company_address || ""))}</p></div><div style="text-align:right"><div class="tag">PAYSLIP</div><p>${month} ${year}</p></div></div>
      <div class="body">
        <div class="who"><div class="avatar">${escapeHtml(initials)}</div><div><div style="font-size:18px;font-weight:800">${escapeHtml(String(employee.full_name))}</div><div style="color:#64748b;font-size:13px">${escapeHtml(String(employee.designation_name || "Employee"))} · ${escapeHtml(String(employee.employee_code || ""))}</div></div></div>
        <div class="grid">${meta.map(([label, value]) => `<div class="row"><span>${escapeHtml(String(label))}</span><span>${escapeHtml(String(value ?? "-"))}</span></div>`).join("")}</div>
        <h3>Attendance summary</h3>
        <div class="grid">${attendance.map(([label, value]) => `<div class="row"><span>${escapeHtml(String(label))}</span><span>${escapeHtml(String(value ?? "-"))}</span></div>`).join("")}</div>
        <h3>Earnings &amp; deductions</h3>
        <div class="totals">
          <div class="row"><span>Gross salary</span><span>${escapeHtml(money(gross))}</span></div>
          <div class="row"><span>Deductions</span><span>- ${escapeHtml(money(deductions))}</span></div>
          <div class="net"><span>Net payable salary</span><span>${escapeHtml(money(net))}</span></div>
        </div>
      </div>
      <div class="foot"><span>Generated ${dateOnly()} · Fast HRMS</span><span>This is a system-generated payslip.</span></div>
    </main>
    <script>if(!window.location.hash.includes("noprint")){setTimeout(function(){window.print()},400)}</script>
  </body></html>`;
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

async function notifyAdmins(db: D1Database, title: string, message: string) {
  const admins = await db.prepare("SELECT id FROM users WHERE role = 'Superadmin' AND is_active = 1").all<{ id: number }>();
  for (const admin of admins.results) {
    await notify(db, admin.id, title, message);
  }
}

async function notificationsList(db: D1Database, user: AppUser) {
  const [rows, unread] = await Promise.all([
    db.prepare("SELECT id, title, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30").bind(user.id).all(),
    scalar(db, "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0", user.id),
  ]);
  return json({ notifications: rows.results, unread });
}

async function markNotificationsRead(db: D1Database, user: AppUser) {
  await db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0").bind(user.id).run();
  return json({ ok: true });
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

// List of YYYY-MM-DD dates from start to end inclusive (empty if end < start or invalid).
function datesInRange(start: string, end: string) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [] as string[];
  const dates: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
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


function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}
