# Fast HRMS

A simple, responsive HRMS web app for a small company of around 20 employees. It uses React, Vite, Tailwind CSS, Cloudflare Pages Functions, and Cloudflare D1.

## Features

- Email/password login with secure hashed passwords and signed HTTP-only session cookies
- Role-based access for `Superadmin` and `Employee`
- Admin dashboard with employee, attendance, leave, and payroll summary cards
- Employee dashboard with check-in/check-out, leave status, salary status, and slip download
- Employee, department, designation, attendance, leave type, leave request, holiday, payroll, settings, report, notification, and audit-log data models
- Salary calculation with paid days, unpaid leave days, absent days, deductions, net salary, and printable salary slip HTML
- CSV exports for attendance, leave, and salary reports
- Cloudflare D1 schema, seed data, and Wrangler configuration

## Demo Accounts

Seeded users use this password:

```txt
password123
```

- Superadmin: `admin@fast.local`
- Employee: `riya@fast.local`
- Employee: `aarav@fast.local`
- Employee: `meera@fast.local`

## Local Setup

Install dependencies:

```bash
npm install
```

Create and migrate the local D1 database:

```bash
npm run db:migrate:local
npm run db:seed:local
```

Build the frontend, then run Cloudflare Pages locally so Functions and D1 are available:

```bash
npm run build
npm run cf:dev
```

Open the local URL printed by Wrangler.

For frontend-only styling work, you can also run:

```bash
npm run dev
```

API calls require `npm run cf:dev`.

## Cloudflare D1 Setup

Create the production D1 database:

```bash
npm run db:create
```

Copy the generated database ID into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "HRMS_DB"
database_name = "fast-hrms"
database_id = "your-d1-database-id"
```

Apply migrations and seed sample data:

```bash
npm run db:migrate
npm run db:seed
```

## Environment Variables

Set a strong session secret in Cloudflare Pages:

```bash
wrangler pages secret put SESSION_SECRET
```

Use a long random value. Local development falls back to a dev secret if none is set.

## Deploy

Deploy to Cloudflare Pages:

```bash
npm run deploy
```

In the Cloudflare dashboard, confirm that the Pages project has the D1 binding:

- Binding name: `HRMS_DB`
- Database: `fast-hrms`

## Optional R2 Salary Slip Storage

Version 1 generates salary slips dynamically from D1 data and stores printable HTML in `salary_slips`. R2 is not required.

If you later want permanent PDF storage:

1. Create an R2 bucket, for example `fast-hrms-salary-slips`.
2. Uncomment the `[[r2_buckets]]` block in `wrangler.toml`.
3. Add PDF generation and upload logic in `functions/api/[[path]].ts`.

## Database

The D1 migration creates:

- `users`
- `employees`
- `departments`
- `designations`
- `attendance`
- `leave_types`
- `leave_requests`
- `holidays`
- `salaries`
- `salary_slips`
- `company_settings`
- `notifications`
- `audit_logs`

Important uniqueness rules are enforced for one attendance record per employee per date, one salary per employee/month/year, and one salary slip per salary.
