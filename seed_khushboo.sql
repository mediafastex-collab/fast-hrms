DELETE FROM users WHERE email IN ('aagam@fastexmedia.com', 'khushboo.das@fastexmedia.com');
DELETE FROM employees WHERE email = 'khushboo.das@fastexmedia.com';

-- Superadmin
INSERT INTO users (email, password_hash, role, is_active) VALUES ('aagam@fastexmedia.com', 'pbkdf2\d4271c6e444112c8ad766c616a6a9a4', 'Superadmin', 1);

-- Employee Khushboo
INSERT INTO users (email, password_hash, role, is_active) VALUES ('khushboo.das@fastexmedia.com', 'pbkdf2\a1bf68870f9d7c3c134519de4ba3e362220eda0eab79bf8ccb7a3090f207', 'Employee', 1);

INSERT INTO employees (user_id, employee_code, full_name, email, department_id, designation_id, joining_date, monthly_salary, employment_status) VALUES (last_insert_rowid(), 'EMP-001', 'Khushboo Das', 'khushboo.das@fastexmedia.com', 1, 1, '2026-03-01', 10000, 'Active');

INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-01', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-02', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-03', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-04', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-05', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-06', 'Absent', 0);
INSERT INTO attendance (employee_id, attendance_date, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-07', 'Absent', 0);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-08', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-09', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-10', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-11', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-12', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-13', 'Absent', 0);
INSERT INTO attendance (employee_id, attendance_date, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-14', 'Absent', 0);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-15', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-16', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-17', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-18', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-19', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-20', 'Absent', 0);
INSERT INTO attendance (employee_id, attendance_date, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-21', 'Absent', 0);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-22', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-23', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-24', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-25', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-26', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-27', 'Absent', 0);
INSERT INTO attendance (employee_id, attendance_date, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-28', 'Absent', 0);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-29', '09:00', '18:00', 'Present', 9);
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, status, total_hours) VALUES ((SELECT id FROM employees WHERE email = 'khushboo.das@fastexmedia.com'), '2026-06-30', '09:00', '18:00', 'Present', 9);
