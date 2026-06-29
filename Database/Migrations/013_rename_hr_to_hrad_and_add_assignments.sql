USE gate_pass_system;

-- This migration flips parent PK values (approval_step_code, gate_pass_status_code)
-- that child tables reference via FKs WITHOUT ON UPDATE CASCADE. Renaming the parent
-- before the children fails with ERROR 1451 on any DB that has those child rows.
-- Disable FK enforcement for the rename; every child is repointed below, so the graph
-- is consistent again before checks are re-enabled at the end of this script.
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Rename step type HR_ASSIGN to HRAD_ASSIGN
UPDATE tbl_approval_step_types
SET approval_step_code = 'HRAD_ASSIGN',
    step_name = 'HRAD Assignment'
WHERE approval_step_code = 'HR_ASSIGN';

-- 2. Rename status PENDING_HR_ASSIGN to PENDING_HRAD_ASSIGN
UPDATE tbl_gate_pass_statuses
SET gate_pass_status_code = 'PENDING_HRAD_ASSIGN',
    status_name = 'Pending HRAD Assignment'
WHERE gate_pass_status_code = 'PENDING_HR_ASSIGN';

-- 3. Update existing request history / tables to match the new code references
UPDATE tbl_gate_pass_requests
SET gate_pass_status_code = 'PENDING_HRAD_ASSIGN'
WHERE gate_pass_status_code = 'PENDING_HR_ASSIGN';

UPDATE tbl_gate_pass_approval_steps
SET approval_step_code = 'HRAD_ASSIGN'
WHERE approval_step_code = 'HR_ASSIGN';

UPDATE tbl_approval_assignments
SET approval_step_code = 'HRAD_ASSIGN'
WHERE approval_step_code = 'HR_ASSIGN';

-- 4. Update noting step description in permissions
UPDATE tbl_permissions
SET description = 'Act on the final PAS/HRAD noting step.'
WHERE permission_code = 'gatepass.note.pas';

-- 5. Merge HR and ADMIN departments into HRAD for all employees
UPDATE tbl_employees
SET department_id = (SELECT department_id FROM tbl_departments WHERE department_code = 'HRAD_DEPARTMENT')
WHERE department_id IN (
    SELECT department_id FROM tbl_departments WHERE department_code IN ('HR_DEPARTMENT', 'ADMIN_DEPARTMENT')
);

-- 6. Deactivate old HR and ADMIN departments
UPDATE tbl_departments
SET is_active = FALSE
WHERE department_code IN ('HR_DEPARTMENT', 'ADMIN_DEPARTMENT');

-- 7. Seed active approval assignments for HRAD_ASSIGN for Joy (GA120) and Roxanne (GA139)
INSERT INTO tbl_approval_assignments (
    approval_step_code,
    form_type_code,
    approver_user_id,
    department_id,
    position_id,
    priority,
    is_alternate,
    is_active
)
SELECT
    'HRAD_ASSIGN',
    'PERSON_GATE_PASS',
    user_account.user_id,
    NULL,
    NULL,
    1,
    FALSE,
    TRUE
FROM tbl_user_accounts user_account
JOIN tbl_employees employee
    ON employee.employee_record_id = user_account.employee_record_id
WHERE employee.employee_id IN ('GA120', 'GA139')
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_approval_assignments existing
      WHERE existing.approval_step_code = 'HRAD_ASSIGN'
        AND existing.form_type_code = 'PERSON_GATE_PASS'
        AND existing.approver_user_id = user_account.user_id
  );

-- 8. Assign PAS_NOTER role to Roxanne (GA139) so she has access to noting, calendar, approvals, etc.
INSERT INTO tbl_user_roles (
    user_id,
    role_id,
    assigned_by_user_id,
    is_active
)
SELECT
    user_account.user_id,
    role_row.role_id,
    NULL,
    TRUE
FROM tbl_user_accounts user_account
JOIN tbl_employees employee
    ON employee.employee_record_id = user_account.employee_record_id
JOIN tbl_roles role_row
    ON role_row.role_code = 'PAS_NOTER'
WHERE employee.employee_id = 'GA139'
ON DUPLICATE KEY UPDATE
    is_active = TRUE;

-- Re-enable FK enforcement now that all parent/child codes are consistent.
SET FOREIGN_KEY_CHECKS = 1;

-- 9. Register schema version 013
INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '013',
    'Rename HR to HRAD, migrate statuses/steps, merge HR/Admin departments, and add HRAD assignments for GA120 and GA139.',
    'Database/Migrations/013_rename_hr_to_hrad_and_add_assignments.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
