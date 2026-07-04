PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO departments (id, name) VALUES
  (1, 'Operations'),
  (2, 'Engineering');

INSERT OR IGNORE INTO designations (id, name) VALUES
  (1, 'HR Manager'),
  (2, 'Software Engineer');

INSERT OR IGNORE INTO leave_types (id, name, is_paid, monthly_balance, yearly_balance) VALUES
  (1, 'Paid Leave', 1, 1.5, 18),
  (2, 'Unpaid Leave', 0, 0, 0),
  (3, 'Casual Leave', 1, 1, 12);

INSERT OR IGNORE INTO users (id, email, password_hash, role, is_active) VALUES
  (1, 'admin@fast.local', 'pbkdf2$100000$457044d4cecedbb814d0573891974e96$edf5377a26d2929311cefddea9cdd5e551fbc2430d3a1898417caa3938ee6f27', 'Superadmin', 1),
  (2, 'riya@fast.local', 'pbkdf2$100000$457044d4cecedbb814d0573891974e96$edf5377a26d2929311cefddea9cdd5e551fbc2430d3a1898417caa3938ee6f27', 'Employee', 1),
  (3, 'aarav@fast.local', 'pbkdf2$100000$457044d4cecedbb814d0573891974e96$edf5377a26d2929311cefddea9cdd5e551fbc2430d3a1898417caa3938ee6f27', 'Employee', 1),
  (4, 'meera@fast.local', 'pbkdf2$100000$457044d4cecedbb814d0573891974e96$edf5377a26d2929311cefddea9cdd5e551fbc2430d3a1898417caa3938ee6f27', 'Employee', 1);

INSERT OR IGNORE INTO employees (id, user_id, employee_code, full_name, email, phone, department_id, designation_id, joining_date, monthly_salary, employment_status, address, bank_name, account_number, ifsc_code) VALUES
  (1, 2, 'EMP-001', 'Riya Sharma', 'riya@fast.local', '9876500001', 1, 1, '2025-01-06', 55000, 'Active', 'Ahmedabad, Gujarat', 'HDFC Bank', '501001000001', 'HDFC0000123'),
  (2, 3, 'EMP-002', 'Aarav Patel', 'aarav@fast.local', '9876500002', 2, 2, '2025-02-10', 72000, 'Active', 'Vadodara, Gujarat', 'ICICI Bank', '601001000002', 'ICIC0000456'),
  (3, 4, 'EMP-003', 'Meera Iyer', 'meera@fast.local', '9876500003', 2, 2, '2025-03-17', 68000, 'Active', 'Surat, Gujarat', 'Axis Bank', '701001000003', 'UTIB0000789');

INSERT OR IGNORE INTO company_settings (id, company_name, company_address, working_days, office_start_time, office_end_time, late_mark_time, half_day_min_hours, deduct_absent_days) VALUES
  (1, 'Fast HRMS Demo Company', '401, Business Avenue, Ahmedabad, Gujarat', 'Mon,Tue,Wed,Thu,Fri', '09:30', '18:30', '10:00', 4, 1);

INSERT OR IGNORE INTO holidays (name, holiday_date, description) VALUES
  ('Independence Day', '2026-08-15', 'National holiday'),
  ('Diwali', '2026-11-08', 'Festival holiday');
