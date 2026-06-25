USE gate_pass_system;

-- Restrict existing PAS assignments for GA150, GA133, and GA120 to PERSON_GATE_PASS
UPDATE tbl_approval_assignments aa
JOIN tbl_user_accounts ua ON ua.user_id = aa.approver_user_id
JOIN tbl_employees e ON e.employee_record_id = ua.employee_record_id
SET aa.form_type_code = 'PERSON_GATE_PASS'
WHERE aa.approval_step_code = 'PAS'
  AND e.employee_id IN ('GA150', 'GA133', 'GA120');

INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '008',
    'Restrict PAS assignments for GA150, GA133, and GA120 to PERSON_GATE_PASS.',
    'Database/Migrations/008_material_gate_pass_pas_restriction.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
