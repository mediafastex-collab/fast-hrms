-- An admin's change to one month's pay: a bonus (positive) or an extra
-- deduction (negative), with the reason the employee sees on their payslip.
-- Kept apart from the attendance figures so recalculating those never wipes it.
ALTER TABLE salaries ADD COLUMN adjustment REAL NOT NULL DEFAULT 0;
ALTER TABLE salaries ADD COLUMN adjustment_note TEXT;
