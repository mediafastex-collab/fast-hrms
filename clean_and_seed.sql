-- Clean existing database tables
DELETE FROM salary_slips;
DELETE FROM salaries;
DELETE FROM attendance;
DELETE FROM leave_requests;
DELETE FROM employees;
DELETE FROM users;
DELETE FROM departments;
DELETE FROM designations;
DELETE FROM holidays;

-- Reset SQLite autoincrement sequences
DELETE FROM sqlite_sequence WHERE name IN ('users', 'employees', 'attendance', 'leave_requests', 'salaries', 'salary_slips', 'departments', 'designations', 'holidays');

-- Insert Departments
INSERT INTO departments (id, name) VALUES (1, 'Marketing');
INSERT INTO departments (id, name) VALUES (2, 'Operations');

-- Insert Designations
INSERT INTO designations (id, name) VALUES (1, 'Digital Marketer');

-- Insert Users
-- Superadmin (pwd: Admin123)
INSERT INTO users (id, email, password_hash, role, is_active) VALUES 
  (1, 'aagam@fastexmedia.com', 'pbkdf2$100000$9f5c5b8be1f107f6ab0f05a8ec416a50$e7636414b07103e5354d06d2b9e1f896b2479e6c5df16e6ce985b883316d7b2b', 'Superadmin', 1);

-- Employee (pwd: FM@001)
INSERT INTO users (id, email, password_hash, role, is_active) VALUES 
  (2, 'khushboo.das@fastexmedia.com', 'pbkdf2$100000$3108718d8ffc8eb36b7331435f754e88$ebab427e71cd3dc94e7a222f2473190536a29b885e151377cc203b9aee59c3ac', 'Employee', 1);

-- Insert Employee record for Khushboo Das
INSERT INTO employees (id, user_id, employee_code, full_name, email, phone, department_id, designation_id, joining_date, monthly_salary, employment_status, address) VALUES
  (1, 2, 'EMP-001', 'Khushboo Das', 'khushboo.das@fastexmedia.com', '9876543210', 1, 1, '2026-03-01', 10000, 'Active', 'Kolkata, West Bengal');

-- Seed Company Settings if they don't exist, otherwise update them
INSERT OR REPLACE INTO company_settings (id, company_name, company_address, working_days, office_start_time, office_end_time, late_mark_time, half_day_min_hours, deduct_absent_days, shift_min_hours) VALUES
  (1, 'Fastex Media', 'Fastex Media Head Office', 'Mon,Tue,Wed,Thu,Fri', '09:30', '18:30', '10:00', 4, 1, 8);

-- Insert Full Attendance for Khushboo Das for June 2026 (22 weekdays)
-- Mon 1st to Fri 5th
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-01', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-02', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-03', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-04', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-05', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');

-- Mon 8th to Fri 12th
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-08', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-09', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-10', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-11', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-12', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');

-- Mon 15th to Fri 19th
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-15', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-16', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-17', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-18', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-19', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');

-- Mon 22nd to Fri 26th
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-22', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-23', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-24', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-25', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-26', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');

-- Mon 29th and Tue 30th
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-29', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, break_start, break_end) VALUES (1, '2026-06-30', '09:30', '18:30', 8.0, 'Present', '13:00', '14:00');
