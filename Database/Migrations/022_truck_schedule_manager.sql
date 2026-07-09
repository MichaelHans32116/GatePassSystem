
USE gate_pass_system;

-- =========================================================
-- Phase 13.11 / Logistics-PPC truck schedule manager.
--
-- Grants MUAMAR (GA136, Logistics/PPC) the ability to maintain
-- the recurring weekly fixed schedules for TRUCK vehicles ONLY,
-- through a dedicated role + permission. HRAD keeps its full
-- fixed-schedule access via the existing username checks; this
-- role is data-driven so additional truck managers can be added
-- later with a single INSERT and no code change.
-- =========================================================

INSERT INTO tbl_permissions (
    permission_code, description
) VALUES
('fleet.truckschedule.manage',
 'Create, edit and delete recurring weekly schedules for TRUCK vehicles only.')
ON DUPLICATE KEY UPDATE
    description = VALUES(description);

INSERT INTO tbl_roles (
    role_code, role_name, description
) VALUES
('TRUCK_SCHEDULE_MANAGER', 'Truck Schedule Manager',
 'Logistics/PPC staff who maintain recurring truck schedules.')
ON DUPLICATE KEY UPDATE
    role_name = VALUES(role_name),
    description = VALUES(description),
    is_active = TRUE;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM tbl_roles r
JOIN tbl_permissions p ON p.permission_code = 'fleet.truckschedule.manage'
WHERE r.role_code = 'TRUCK_SCHEDULE_MANAGER'
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

-- Assign MUAMAR (GA136) to the role. If the account does not exist yet on this
-- environment nothing is inserted, and the grant simply takes effect once it does.
INSERT INTO tbl_user_roles (user_id, role_id, is_active)
SELECT ua.user_id, r.role_id, TRUE
FROM tbl_user_accounts ua
JOIN tbl_roles r ON r.role_code = 'TRUCK_SCHEDULE_MANAGER'
WHERE ua.username = 'GA136'
ON DUPLICATE KEY UPDATE is_active = TRUE;

-- Register schema version 022
INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '022',
    'Add truck schedule manager role/permission and grant MUAMAR (GA136).',
    'Database/Migrations/022_truck_schedule_manager.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
