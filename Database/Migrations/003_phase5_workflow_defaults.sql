USE gate_pass_system;

INSERT INTO tbl_roles (
    role_code,
    role_name,
    description,
    is_active
) VALUES (
    'DRIVER',
    'Driver',
    'Can create personal gate passes and be assigned to company vehicles.',
    TRUE
)
ON DUPLICATE KEY UPDATE
    role_name = VALUES(role_name),
    description = VALUES(description),
    is_active = TRUE;

UPDATE tbl_user_roles user_role
JOIN tbl_roles role_row
    ON role_row.role_id = user_role.role_id
SET user_role.is_active = FALSE
WHERE role_row.role_code = 'HR_ADMIN';

UPDATE tbl_roles
SET is_active = FALSE
WHERE role_code = 'HR_ADMIN';

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.role_id, permission_row.permission_id
FROM tbl_roles role_row
JOIN tbl_permissions permission_row
    ON permission_row.permission_code IN (
        'gatepass.create.own',
        'gatepass.read.own'
    )
WHERE role_row.role_code = 'DRIVER'
ON DUPLICATE KEY UPDATE
    permission_id = VALUES(permission_id);

INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '003',
    'Phase 5 role cleanup, PAS routing, employee QR, and fleet workflow.',
    'Database/Migrations/003_phase5_workflow_defaults.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
