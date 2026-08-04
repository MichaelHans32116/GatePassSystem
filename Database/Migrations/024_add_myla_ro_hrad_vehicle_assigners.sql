USE gate_pass_system;

-- Phase 18.4: refresh the HRAD vehicle-assignment roster from the approved
-- 2026-07-07 employee export. GA139 (Roxanne / Ma'am Ro) already exists on
-- older installations; GA412 (Myla) is new to the Form Request database.
--
-- Only the minimum employee fields required by Form Request are imported.
-- The initial GA412 password hash below is a salted PBKDF2 hash derived from
-- the approved date-hired default and is never applied over an existing hash.

START TRANSACTION;

INSERT INTO tbl_positions (
    department_id,
    position_name,
    hierarchy_level,
    is_management,
    is_active
)
SELECT
    department.department_id,
    'HRAD ENGINEER',
    0,
    FALSE,
    TRUE
FROM tbl_departments department
WHERE department.department_code = 'HRAD_DEPARTMENT'
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_positions existing
      WHERE existing.department_id = department.department_id
        AND existing.position_name = 'HRAD ENGINEER'
  );

INSERT INTO tbl_employees (
    employee_id,
    full_name,
    department_id,
    position_id,
    date_hired,
    employment_status_code
)
SELECT
    'GA412',
    'MYLA MAE C. ABARQUEZ',
    department.department_id,
    position_row.position_id,
    '2026-07-02',
    'ACTIVE'
FROM tbl_departments department
JOIN tbl_positions position_row
  ON position_row.department_id = department.department_id
 AND position_row.position_name = 'HRAD ENGINEER'
WHERE department.department_code = 'HRAD_DEPARTMENT'
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    department_id = VALUES(department_id),
    position_id = VALUES(position_id),
    date_hired = VALUES(date_hired),
    employment_status_code = VALUES(employment_status_code);

INSERT INTO tbl_user_accounts (
    employee_record_id,
    username,
    display_name,
    password_hash,
    account_type_code,
    account_status_code,
    must_change_password
)
SELECT
    employee.employee_record_id,
    employee.employee_id,
    employee.full_name,
    'PBKDF2-SHA256$210000$d8zPYbOgVxuLyfoEj+46DA==$5mi9NFovGv208YicBsq7i4zr4C037W0RY8MuVxy0VyU=',
    'EMPLOYEE',
    'ACTIVE',
    TRUE
FROM tbl_employees employee
WHERE employee.employee_id = 'GA412'
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_user_accounts existing
      WHERE existing.employee_record_id = employee.employee_record_id
  );

-- Preserve any password that was already changed. Only keep identity/status
-- fields aligned with the refreshed employee record.
UPDATE tbl_user_accounts user_account
JOIN tbl_employees employee
  ON employee.employee_record_id = user_account.employee_record_id
SET user_account.display_name = employee.full_name,
    user_account.account_status_code = 'ACTIVE'
WHERE employee.employee_id = 'GA412';

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
  ON role_row.role_code IN ('ASSOCIATE', 'PAS_NOTER')
WHERE employee.employee_id = 'GA412'
ON DUPLICATE KEY UPDATE
    is_active = TRUE;

-- Existing rows are promoted from alternate/legacy ordering so Myla and
-- Ma'am Ro participate equally in workload-based HRAD assignment selection.
UPDATE tbl_approval_assignments assignment
JOIN tbl_user_accounts user_account
  ON user_account.user_id = assignment.approver_user_id
JOIN tbl_employees employee
  ON employee.employee_record_id = user_account.employee_record_id
SET assignment.priority = 1,
    assignment.is_alternate = FALSE,
    assignment.is_active = TRUE,
    assignment.valid_from = NULL,
    assignment.valid_until = NULL
WHERE assignment.approval_step_code = 'HRAD_ASSIGN'
  AND assignment.form_type_code IN ('PERSON_GATE_PASS', 'MATERIAL_GATE_PASS')
  AND employee.employee_id IN ('GA139', 'GA412');

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
    form_type.form_type_code,
    user_account.user_id,
    NULL,
    NULL,
    1,
    FALSE,
    TRUE
FROM tbl_user_accounts user_account
JOIN tbl_employees employee
  ON employee.employee_record_id = user_account.employee_record_id
JOIN (
    SELECT 'PERSON_GATE_PASS' AS form_type_code
    UNION ALL
    SELECT 'MATERIAL_GATE_PASS'
) form_type
WHERE employee.employee_id IN ('GA139', 'GA412')
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_approval_assignments existing
      WHERE existing.approval_step_code = 'HRAD_ASSIGN'
        AND existing.form_type_code = form_type.form_type_code
        AND existing.approver_user_id = user_account.user_id
  );

INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '024',
    'Import GA412 Myla and activate GA139 Roxanne plus GA412 as HRAD vehicle assigners.',
    'Database/Migrations/024_add_myla_ro_hrad_vehicle_assigners.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);

COMMIT;
