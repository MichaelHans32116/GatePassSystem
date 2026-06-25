USE gate_pass_system;

DELETE role_permission
FROM tbl_role_permissions role_permission
JOIN tbl_roles role_row
    ON role_row.role_id = role_permission.role_id
JOIN tbl_permissions permission_row
    ON permission_row.permission_id = role_permission.permission_id
WHERE role_row.role_code = 'SYSTEM_ADMIN'
  AND permission_row.permission_code = 'gatepass.scan';

INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '004',
    'Restrict scanning to Security and add employee QR cooldown workflow.',
    'Database/Migrations/004_security_employee_qr.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
