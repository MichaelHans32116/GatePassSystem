USE gate_pass_system;

-- Safe reference data only. No employee names, password hashes, or production
-- server credentials belong in this file.

-- =========================================================
-- EXPANDABLE REFERENCE VALUES
-- =========================================================

INSERT INTO tbl_employment_statuses (
    employment_status_code, status_name, allows_login, sort_order
) VALUES
('ACTIVE', 'Active', TRUE, 10),
('INACTIVE', 'Inactive', FALSE, 20)
ON DUPLICATE KEY UPDATE
    status_name = VALUES(status_name),
    allows_login = VALUES(allows_login),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

INSERT INTO tbl_account_types (
    account_type_code, type_name, description
) VALUES
('EMPLOYEE', 'Employee', 'Account linked to an MPI employee record.'),
('SECURITY_AGENCY', 'Security Agency', 'External security/kiosk account.'),
('SYSTEM', 'System', 'Non-employee technical or service account.')
ON DUPLICATE KEY UPDATE
    type_name = VALUES(type_name),
    description = VALUES(description),
    is_active = TRUE;

INSERT INTO tbl_account_statuses (
    account_status_code, status_name, allows_login, sort_order
) VALUES
('ACTIVE', 'Active', TRUE, 10),
('LOCKED', 'Locked', FALSE, 20),
('ARCHIVED', 'Archived', FALSE, 30)
ON DUPLICATE KEY UPDATE
    status_name = VALUES(status_name),
    allows_login = VALUES(allows_login),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

INSERT INTO tbl_approval_step_types (
    approval_step_code, step_name, sort_order
) VALUES
('SUPERIOR', 'Immediate Superior Approval', 10),
('PRESIDENT', 'President Approval', 20),
('PAS', 'PAS / HR Noting', 30)
ON DUPLICATE KEY UPDATE
    step_name = VALUES(step_name),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

INSERT INTO tbl_gate_pass_statuses (
    gate_pass_status_code,
    status_name,
    status_group,
    is_terminal,
    allows_qr_scan,
    sort_order
) VALUES
('DRAFT', 'Draft', 'DRAFT', FALSE, FALSE, 10),
('PENDING_SUPERIOR', 'Pending Superior Approval', 'PENDING', FALSE, FALSE, 20),
('PENDING_PRESIDENT', 'Pending President Approval', 'PENDING', FALSE, FALSE, 30),
('PENDING_PAS', 'Pending PAS / HR Noting', 'PENDING', FALSE, FALSE, 40),
('APPROVED', 'Approved', 'ACTIVE', FALSE, TRUE, 50),
('OUTSIDE', 'Currently Outside', 'ACTIVE', FALSE, TRUE, 60),
('OVERDUE', 'Overdue Return', 'ACTIVE', FALSE, TRUE, 70),
('RETURNED', 'Returned', 'COMPLETED', TRUE, FALSE, 80),
('CLOSED', 'Closed', 'COMPLETED', TRUE, FALSE, 90),
('REJECTED', 'Rejected', 'TERMINAL', TRUE, FALSE, 100),
('CANCELLED', 'Cancelled', 'TERMINAL', TRUE, FALSE, 110),
('EXPIRED', 'Expired', 'TERMINAL', TRUE, FALSE, 120)
ON DUPLICATE KEY UPDATE
    status_name = VALUES(status_name),
    status_group = VALUES(status_group),
    is_terminal = VALUES(is_terminal),
    allows_qr_scan = VALUES(allows_qr_scan),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

INSERT INTO tbl_approval_statuses (
    approval_status_code, status_name, is_terminal, sort_order
) VALUES
('PENDING', 'Pending', FALSE, 10),
('APPROVED', 'Approved', TRUE, 20),
('REJECTED', 'Rejected', TRUE, 30),
('SKIPPED', 'Skipped', TRUE, 40),
('CANCELLED', 'Cancelled', TRUE, 50)
ON DUPLICATE KEY UPDATE
    status_name = VALUES(status_name),
    is_terminal = VALUES(is_terminal),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

INSERT INTO tbl_vehicle_usage_types (
    vehicle_usage_code,
    usage_name,
    requires_vehicle_record,
    requires_president_approval
) VALUES
('NONE', 'No Vehicle', FALSE, FALSE),
('PRIVATE', 'Private Vehicle', FALSE, FALSE),
('COMPANY', 'Company Vehicle', TRUE, TRUE)
ON DUPLICATE KEY UPDATE
    usage_name = VALUES(usage_name),
    requires_vehicle_record = VALUES(requires_vehicle_record),
    requires_president_approval = VALUES(requires_president_approval),
    is_active = TRUE;

INSERT INTO tbl_vehicle_statuses (
    vehicle_status_code, status_name, is_selectable, sort_order
) VALUES
('AVAILABLE', 'Available', TRUE, 10),
('MAINTENANCE', 'Maintenance', FALSE, 20),
('UNAVAILABLE', 'Unavailable', FALSE, 30),
('ARCHIVED', 'Archived', FALSE, 40)
ON DUPLICATE KEY UPDATE
    status_name = VALUES(status_name),
    is_selectable = VALUES(is_selectable),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

INSERT INTO tbl_driver_types (
    driver_type_code, type_name
) VALUES
('EMPLOYEE', 'Employee Driver'),
('EXTERNAL', 'External Driver')
ON DUPLICATE KEY UPDATE
    type_name = VALUES(type_name),
    is_active = TRUE;

INSERT INTO tbl_reservation_statuses (
    reservation_status_code,
    status_name,
    blocks_availability,
    is_terminal,
    sort_order
) VALUES
('PENDING', 'Pending Approval', TRUE, FALSE, 10),
('RESERVED', 'Reserved', TRUE, FALSE, 20),
('IN_USE', 'In Use', TRUE, FALSE, 30),
('OVERDUE', 'Overdue', TRUE, FALSE, 40),
('RETURNED', 'Returned', FALSE, TRUE, 50),
('CANCELLED', 'Cancelled', FALSE, TRUE, 60)
ON DUPLICATE KEY UPDATE
    status_name = VALUES(status_name),
    blocks_availability = VALUES(blocks_availability),
    is_terminal = VALUES(is_terminal),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

INSERT INTO tbl_scan_methods (
    scan_method_code, method_name
) VALUES
('QR', 'QR Code'),
('MANUAL_GATE_PASS', 'Manual Gate Pass Number'),
('MANUAL_EMPLOYEE_ID', 'Manual Employee ID')
ON DUPLICATE KEY UPDATE
    method_name = VALUES(method_name),
    is_active = TRUE;

INSERT INTO tbl_scan_actions (
    scan_action_code, action_name, sort_order
) VALUES
('VERIFY', 'Verification', 10),
('TIME_OUT', 'Time Out', 20),
('TIME_IN', 'Time In', 30),
('REJECTED_ATTEMPT', 'Rejected Attempt', 40)
ON DUPLICATE KEY UPDATE
    action_name = VALUES(action_name),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

INSERT INTO tbl_import_statuses (
    import_status_code, status_name, is_terminal, sort_order
) VALUES
('STARTED', 'Started', FALSE, 10),
('COMPLETED', 'Completed', TRUE, 20),
('FAILED', 'Failed', TRUE, 30)
ON DUPLICATE KEY UPDATE
    status_name = VALUES(status_name),
    is_terminal = VALUES(is_terminal),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

-- =========================================================
-- ROLES AND PERMISSIONS
-- =========================================================

INSERT INTO tbl_roles (
    role_code, role_name, description
) VALUES
('ASSOCIATE', 'Associate', 'Can create gate pass requests for their own employee record.'),
('IMMEDIATE_SUPERIOR', 'Immediate Superior', 'Can act on assigned superior approval steps.'),
('PRESIDENT', 'President', 'Can act on required executive approval steps.'),
('PAS_NOTER', 'PAS / HR Noter', 'Can perform the final PAS/HR noting step.'),
('HR_ADMIN', 'HR Administrator', 'Can monitor requests, employees, and operational reports.'),
('SECURITY', 'Security', 'Can verify passes and record Time Out and Time In.'),
('SYSTEM_ADMIN', 'System Administrator', 'Can manage accounts, roles, configuration, and audit logs.')
ON DUPLICATE KEY UPDATE
    role_name = VALUES(role_name),
    description = VALUES(description),
    is_active = TRUE;

INSERT INTO tbl_permissions (
    permission_code, description
) VALUES
('gatepass.create.own', 'Create a gate pass for the logged-in employee only.'),
('gatepass.read.own', 'Read the logged-in employee gate pass records.'),
('gatepass.read.department', 'Read gate pass records for assigned departments.'),
('gatepass.read.all', 'Read all gate pass records.'),
('gatepass.approve.superior', 'Act on an assigned immediate-superior approval step.'),
('gatepass.approve.president', 'Act on a required president approval step.'),
('gatepass.note.pas', 'Act on the final PAS/HR noting step.'),
('gatepass.scan', 'Verify and scan approved gate passes.'),
('gatepass.monitor.outside', 'View currently outside and overdue associates.'),
('employees.read', 'View approved employee identity fields.'),
('users.manage', 'Create, update, lock, and archive user accounts.'),
('roles.manage', 'Manage user role assignments and permissions.'),
('departments.manage', 'Manage departments, positions, and approval assignments.'),
('fleet.manage', 'Manage vehicles and drivers.'),
('reports.view', 'View operational reports.'),
('audit.view', 'View immutable audit logs.')
ON DUPLICATE KEY UPDATE
    description = VALUES(description);

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM tbl_roles r
JOIN tbl_permissions p ON p.permission_code IN (
    'gatepass.create.own',
    'gatepass.read.own'
)
WHERE r.role_code = 'ASSOCIATE'
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM tbl_roles r
JOIN tbl_permissions p ON p.permission_code IN (
    'gatepass.create.own',
    'gatepass.read.own',
    'gatepass.read.department',
    'gatepass.approve.superior',
    'gatepass.monitor.outside'
)
WHERE r.role_code = 'IMMEDIATE_SUPERIOR'
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM tbl_roles r
JOIN tbl_permissions p ON p.permission_code IN (
    'gatepass.create.own',
    'gatepass.read.own',
    'gatepass.read.all',
    'gatepass.approve.president',
    'reports.view'
)
WHERE r.role_code = 'PRESIDENT'
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM tbl_roles r
JOIN tbl_permissions p ON p.permission_code IN (
    'gatepass.create.own',
    'gatepass.read.own',
    'gatepass.read.all',
    'gatepass.note.pas',
    'gatepass.monitor.outside',
    'reports.view'
)
WHERE r.role_code = 'PAS_NOTER'
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM tbl_roles r
JOIN tbl_permissions p ON p.permission_code IN (
    'gatepass.create.own',
    'gatepass.read.own',
    'gatepass.read.all',
    'gatepass.monitor.outside',
    'employees.read',
    'fleet.manage',
    'reports.view'
)
WHERE r.role_code = 'HR_ADMIN'
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM tbl_roles r
JOIN tbl_permissions p ON p.permission_code IN (
    'gatepass.scan',
    'gatepass.monitor.outside'
)
WHERE r.role_code = 'SECURITY'
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM tbl_roles r
JOIN tbl_permissions p ON p.permission_code IN (
    'gatepass.create.own',
    'gatepass.read.own',
    'gatepass.read.all',
    'gatepass.scan',
    'gatepass.monitor.outside',
    'employees.read',
    'users.manage',
    'roles.manage',
    'departments.manage',
    'fleet.manage',
    'reports.view',
    'audit.view'
)
WHERE r.role_code = 'SYSTEM_ADMIN'
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

-- =========================================================
-- INITIAL ORGANIZATION REFERENCES
-- =========================================================

INSERT INTO tbl_departments (
    department_code, department_name
) VALUES
('ADMIN_DEPARTMENT', 'ADMIN DEPARTMENT'),
('FINANCE_IT_DEPARTMENT', 'FINANCE & IT DEPARTMENT'),
('FINANCE_HR_IT_DEPARTMENT', 'FINANCE, HR & IT DEPARTMENT'),
('HRAD_DEPARTMENT', 'HRAD DEPARTMENT'),
('INJECTION_ASSEMBLY_PRODUCTION_DEPARTMENT', 'INJECTION/ASSEMBLY PRODUCTION DEPARTMENT'),
('PPC_DEPARTMENT', 'PPC DEPARTMENT'),
('PRODUCTION_ASSEMBLY_DEPARTMENT', 'PRODUCTION - ASSEMBLY DEPARTMENT'),
('PRODUCTION_INJECTION_DEPARTMENT', 'PRODUCTION - INJECTION DEPARTMENT'),
('PRODUCTION_DEPARTMENT', 'PRODUCTION DEPARTMENT'),
('PRODUCTION_ENGINEERING_DEPARTMENT', 'PRODUCTION ENGINEERING DEPARTMENT'),
('PURCHASING_DEPARTMENT', 'PURCHASING DEPARTMENT'),
('QUALITY_ASSURANCE_DEPARTMENT', 'QUALITY ASSURANCE DEPARTMENT'),
('AGENCY', 'AGENCY')
ON DUPLICATE KEY UPDATE
    department_code = VALUES(department_code),
    department_name = VALUES(department_name),
    is_active = TRUE;

INSERT INTO tbl_schema_versions (
    version_no, description, script_name
) VALUES (
    '001',
    'Initial scalable Gate Pass schema with HowConnect naming conventions.',
    'Database/schema.sql'
), (
    '002',
    'Gate pass application, approval outcome, completion timestamps, and status history.',
    'Database/Migrations/002_gate_pass_lifecycle_timestamps.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
