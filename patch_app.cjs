const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add monthNames
if (!code.includes('const monthNames =')) {
  code = code.replace(
    'const today = new Date().toISOString().slice(0, 10);',
    'const today = new Date().toISOString().slice(0, 10);\nconst monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];'
  );
}

// 2. Fix workedHMS
if (!code.includes('function workedHMS')) {
  code = code.replace(
    'function formatTime(s: number) {',
    'function workedHMS(row: any) {\n  if (!row.check_in || !row.check_out) return "-";\n  const ms = new Date(`2000-01-01T${row.check_out}`).getTime() - new Date(`2000-01-01T${row.check_in}`).getTime();\n  if (isNaN(ms) || ms < 0) return "-";\n  let s = Math.floor(ms / 1000);\n  if (row.break_start && row.break_end) {\n    const bms = new Date(`2000-01-01T${row.break_end}`).getTime() - new Date(`2000-01-01T${row.break_start}`).getTime();\n    if (!isNaN(bms) && bms > 0) s -= Math.floor(bms / 1000);\n  }\n  return formatTime(Math.max(0, s));\n}\n\nfunction formatTime(s: number) {'
  );
}

// 3. Update formatTime to show seconds
code = code.replace(
  'return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;',
  'return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;'
);

// 4. EmployeeDashboard Sunday Check-in logic
code = code.replace(
  'const hasCheckedIn = Boolean(summary.todayAttendance?.check_in);',
  'const isSunday = new Date().getDay() === 0;\n  const hasCheckedIn = Boolean(summary.todayAttendance?.check_in);'
);

code = code.replace(
  '{!hasCheckedIn ? (',
  '{isSunday ? (\n                   <span className="badge bg-slate-100 text-slate-600 px-4 py-2 text-sm border border-slate-200">Weekend (No check-in)</span>\n                ) : !hasCheckedIn ? ('
);

fs.writeFileSync('src/App.tsx', code);
console.log("Patched App.tsx base successfully.");
