const fs = require('fs');
let sql = `
DELETE FROM attendance WHERE employee_id = 2;
DELETE FROM attendance_requests WHERE employee_id = 2;
`;

// June 2026 has 30 days. June 1, 2026 is a Monday.
for (let d = 1; d <= 30; d++) {
  const dateStr = `2026-06-${String(d).padStart(2, '0')}`;
  const dateObj = new Date(dateStr);
  if (dateObj.getDay() === 0) {
    // Sunday
    sql += `INSERT INTO attendance (employee_id, attendance_date, status, created_at) VALUES (2, '${dateStr}', 'Absent', '${dateStr} 00:00:00');\n`;
  } else {
    // Mon-Sat
    sql += `INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, created_at) VALUES (2, '${dateStr}', '10:00:00', '14:00:00', 'Present', '${dateStr} 00:00:00');\n`;
  }
}

fs.writeFileSync('reset_khushboo.sql', sql);
console.log('reset_khushboo.sql generated');
