INSERT INTO users (email, password_hash, role, is_active) 
VALUES ('khushboo@fast.local', 'pbkdf2$100000$457044d4cecedbb814d0573891974e96$edf5377a26d2929311cefddea9cdd5e551fbc2430d3a1898417caa3938ee6f27', 'Employee', 1);

INSERT INTO employees (user_id, employee_code, full_name, email, department_id, designation_id, joining_date, monthly_salary, employment_status)
VALUES (last_insert_rowid(), 'EMP-004', 'Khushboo Das', 'khushboo@fast.local', 1, 1, '2026-01-01', 10000, 'Active');
