-- Safe reference seed data for local development.
-- Do not place real employee names, real passwords, or production secrets here.

INSERT INTO roles (code, name, description) VALUES
('ASSOCIATE', 'Associate', 'Can create and view own gate pass requests.'),
('IMMEDIATE_SUPERIOR', 'Immediate Superior', 'Can approve department requests at superior step.'),
('PRESIDENT', 'President', 'Can approve requests requiring president approval.'),
('PAS_HR_ADMIN', 'PAS / HR Admin', 'Can note/finalize approved requests and manage fleet records.'),
('SECURITY', 'Security', 'Can scan approved gate passes for Time Out and Time In.'),
('SYSTEM_ADMIN', 'System Admin', 'Can manage users, roles, departments, and system configuration.')
ON DUPLICATE KEY UPDATE
name = VALUES(name),
description = VALUES(description);

INSERT INTO permissions (code, description) VALUES
('gatepass.create', 'Create gate pass requests.'),
('gatepass.read.own', 'Read own gate pass requests.'),
('gatepass.read.department', 'Read department gate pass requests.'),
('gatepass.read.all', 'Read all gate pass requests.'),
('gatepass.approve.superior', 'Approve superior approval step.'),
('gatepass.approve.president', 'Approve president approval step.'),
('gatepass.note.pas', 'Finalize PAS / HR noting step.'),
('gatepass.scan', 'Record security scans.'),
('users.manage', 'Manage user accounts.'),
('roles.manage', 'Manage roles and permissions.'),
('departments.manage', 'Manage departments and positions.'),
('fleet.manage', 'Manage vehicles and drivers.'),
('reports.view', 'View reports.'),
('audit.view', 'View audit logs.')
ON DUPLICATE KEY UPDATE
description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('gatepass.create', 'gatepass.read.own')
WHERE r.code = 'ASSOCIATE'
ON DUPLICATE KEY UPDATE permission_id = permission_id;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('gatepass.create', 'gatepass.read.own', 'gatepass.read.department', 'gatepass.approve.superior')
WHERE r.code = 'IMMEDIATE_SUPERIOR'
ON DUPLICATE KEY UPDATE permission_id = permission_id;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('gatepass.read.all', 'gatepass.approve.president', 'reports.view')
WHERE r.code = 'PRESIDENT'
ON DUPLICATE KEY UPDATE permission_id = permission_id;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('gatepass.create', 'gatepass.read.own', 'gatepass.read.all', 'gatepass.note.pas', 'fleet.manage', 'reports.view')
WHERE r.code = 'PAS_HR_ADMIN'
ON DUPLICATE KEY UPDATE permission_id = permission_id;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('gatepass.scan', 'gatepass.read.department')
WHERE r.code = 'SECURITY'
ON DUPLICATE KEY UPDATE permission_id = permission_id;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'gatepass.create',
    'gatepass.read.own',
    'gatepass.read.all',
    'users.manage',
    'roles.manage',
    'departments.manage',
    'fleet.manage',
    'reports.view',
    'audit.view'
)
WHERE r.code = 'SYSTEM_ADMIN'
ON DUPLICATE KEY UPDATE permission_id = permission_id;

INSERT INTO departments (code, name) VALUES
('ADMIN', 'Admin Department'),
('FINANCE_IT', 'Finance & IT Department'),
('HRAD', 'HRAD Department'),
('PRODUCTION', 'Production Department'),
('PPC', 'PPC Department'),
('QA', 'Quality Assurance Department'),
('PURCHASING', 'Purchasing Department'),
('ENGINEERING', 'Engineering Department'),
('EXECUTIVE', 'Executive Department'),
('AGENCY', 'Agency')
ON DUPLICATE KEY UPDATE
name = VALUES(name);
