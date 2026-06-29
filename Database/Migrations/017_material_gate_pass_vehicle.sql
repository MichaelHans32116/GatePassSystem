USE gate_pass_system;

-- =========================================================
-- Phase 11.1 / Bug 6: Add company-vehicle support to
-- Material Gate Pass by giving GA120 (Miss Joy) and GA139
-- (Roxanne) HRAD_ASSIGN approval-assignment entries for the
-- MATERIAL_GATE_PASS form type.  The person gate pass already
-- had these rows (migration 013); material gate pass was
-- missing them so FindApproverAsync returned null and no
-- HRAD_ASSIGN step was ever added to the route.
-- =========================================================

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
    'MATERIAL_GATE_PASS',
    user_account.user_id,
    NULL,
    NULL,
    1,
    FALSE,
    TRUE
FROM tbl_employees employee
JOIN tbl_user_accounts user_account
    ON employee.employee_record_id = user_account.employee_record_id
WHERE employee.employee_id IN ('GA120', 'GA139')
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_approval_assignments existing
      WHERE existing.approval_step_code = 'HRAD_ASSIGN'
        AND existing.form_type_code = 'MATERIAL_GATE_PASS'
        AND existing.approver_user_id = user_account.user_id
  );

-- Register schema version 017
INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '017',
    'Add HRAD_ASSIGN approval assignments for MATERIAL_GATE_PASS (company vehicle support).',
    'Database/Migrations/017_material_gate_pass_vehicle.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
