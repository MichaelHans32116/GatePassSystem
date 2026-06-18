-- Gate Pass System canonical database schema
-- Target: MariaDB 10.4+ / MySQL-compatible server
--
-- Naming follows the established HowConnect repository pattern:
--   tbl_*  = persisted tables
--   view_* = database views
--   SP_*   = stored procedures (added per workflow phase)
--   *_id   = primary and foreign keys
--   *_code = stable application/reference identifiers
--
-- Expandable statuses and types use reference tables instead of ENUM columns.

CREATE DATABASE IF NOT EXISTS gate_pass_system
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE gate_pass_system;

-- =========================================================
-- REFERENCE AND AUTHORIZATION TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS tbl_schema_versions (
    schema_version_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    version_no VARCHAR(30) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL,
    script_name VARCHAR(255) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_roles (
    role_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    role_code VARCHAR(50) NOT NULL UNIQUE,
    role_name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    is_system_role BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_permissions (
    permission_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    permission_code VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_role_permissions (
    role_id BIGINT UNSIGNED NOT NULL,
    permission_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id) REFERENCES tbl_roles(role_id),
    CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_id) REFERENCES tbl_permissions(permission_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_employment_statuses (
    employment_status_code VARCHAR(30) PRIMARY KEY,
    status_name VARCHAR(80) NOT NULL,
    allows_login BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_account_types (
    account_type_code VARCHAR(30) PRIMARY KEY,
    type_name VARCHAR(80) NOT NULL,
    description VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_account_statuses (
    account_status_code VARCHAR(30) PRIMARY KEY,
    status_name VARCHAR(80) NOT NULL,
    allows_login BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_approval_step_types (
    approval_step_code VARCHAR(30) PRIMARY KEY,
    step_name VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_gate_pass_statuses (
    gate_pass_status_code VARCHAR(40) PRIMARY KEY,
    status_name VARCHAR(100) NOT NULL,
    status_group VARCHAR(40) NOT NULL,
    is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
    allows_qr_scan BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    INDEX ix_gate_pass_status_group (status_group, sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_approval_statuses (
    approval_status_code VARCHAR(30) PRIMARY KEY,
    status_name VARCHAR(80) NOT NULL,
    is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_vehicle_usage_types (
    vehicle_usage_code VARCHAR(30) PRIMARY KEY,
    usage_name VARCHAR(80) NOT NULL,
    requires_vehicle_record BOOLEAN NOT NULL DEFAULT FALSE,
    requires_president_approval BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_vehicle_statuses (
    vehicle_status_code VARCHAR(30) PRIMARY KEY,
    status_name VARCHAR(80) NOT NULL,
    is_selectable BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_driver_types (
    driver_type_code VARCHAR(30) PRIMARY KEY,
    type_name VARCHAR(80) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_reservation_statuses (
    reservation_status_code VARCHAR(30) PRIMARY KEY,
    status_name VARCHAR(80) NOT NULL,
    blocks_availability BOOLEAN NOT NULL DEFAULT FALSE,
    is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_scan_methods (
    scan_method_code VARCHAR(30) PRIMARY KEY,
    method_name VARCHAR(80) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_scan_actions (
    scan_action_code VARCHAR(30) PRIMARY KEY,
    action_name VARCHAR(80) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_import_statuses (
    import_status_code VARCHAR(30) PRIMARY KEY,
    status_name VARCHAR(80) NOT NULL,
    is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- =========================================================
-- ORGANIZATION AND IDENTITY TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS tbl_departments (
    department_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    department_code VARCHAR(60) NOT NULL UNIQUE,
    department_name VARCHAR(150) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_positions (
    position_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    department_id BIGINT UNSIGNED NOT NULL,
    position_name VARCHAR(150) NOT NULL,
    hierarchy_level INT NOT NULL DEFAULT 0,
    is_management BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_positions_department
        FOREIGN KEY (department_id) REFERENCES tbl_departments(department_id),
    UNIQUE KEY ux_position_department_name (department_id, position_name),
    INDEX ix_positions_name (position_name),
    INDEX ix_positions_hierarchy (department_id, hierarchy_level)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_employee_import_batches (
    import_batch_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    source_file_name VARCHAR(255) NOT NULL,
    source_file_sha256 CHAR(64) NOT NULL,
    total_rows INT UNSIGNED NOT NULL DEFAULT 0,
    active_rows INT UNSIGNED NOT NULL DEFAULT 0,
    inactive_rows INT UNSIGNED NOT NULL DEFAULT 0,
    import_status_code VARCHAR(30) NOT NULL DEFAULT 'STARTED',
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    notes VARCHAR(500) NULL,
    CONSTRAINT fk_employee_import_status
        FOREIGN KEY (import_status_code)
        REFERENCES tbl_import_statuses(import_status_code),
    INDEX ix_employee_import_file_hash (source_file_sha256),
    INDEX ix_employee_import_time (imported_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_employees (
    employee_record_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    employee_id VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(180) NOT NULL,
    department_id BIGINT UNSIGNED NOT NULL,
    position_id BIGINT UNSIGNED NOT NULL,
    date_hired DATE NOT NULL,
    employment_status_code VARCHAR(30) NOT NULL,
    source_import_batch_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_employees_department
        FOREIGN KEY (department_id) REFERENCES tbl_departments(department_id),
    CONSTRAINT fk_employees_position
        FOREIGN KEY (position_id) REFERENCES tbl_positions(position_id),
    CONSTRAINT fk_employees_status
        FOREIGN KEY (employment_status_code)
        REFERENCES tbl_employment_statuses(employment_status_code),
    CONSTRAINT fk_employees_import_batch
        FOREIGN KEY (source_import_batch_id)
        REFERENCES tbl_employee_import_batches(import_batch_id),
    INDEX ix_employees_status_department
        (employment_status_code, department_id),
    INDEX ix_employees_name (full_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_user_accounts (
    user_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    employee_record_id BIGINT UNSIGNED NULL UNIQUE,
    username VARCHAR(80) NOT NULL UNIQUE,
    display_name VARCHAR(180) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    account_type_code VARCHAR(30) NOT NULL,
    account_status_code VARCHAR(30) NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    last_login_at DATETIME NULL,
    last_password_change_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_accounts_employee
        FOREIGN KEY (employee_record_id)
        REFERENCES tbl_employees(employee_record_id),
    CONSTRAINT fk_user_accounts_type
        FOREIGN KEY (account_type_code)
        REFERENCES tbl_account_types(account_type_code),
    CONSTRAINT fk_user_accounts_status
        FOREIGN KEY (account_status_code)
        REFERENCES tbl_account_statuses(account_status_code),
    INDEX ix_user_accounts_status (account_status_code),
    INDEX ix_user_accounts_type_status
        (account_type_code, account_status_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_user_roles (
    user_id BIGINT UNSIGNED NOT NULL,
    role_id BIGINT UNSIGNED NOT NULL,
    assigned_by_user_id BIGINT UNSIGNED NULL,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id) REFERENCES tbl_user_accounts(user_id),
    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id) REFERENCES tbl_roles(role_id),
    CONSTRAINT fk_user_roles_assigned_by
        FOREIGN KEY (assigned_by_user_id) REFERENCES tbl_user_accounts(user_id),
    INDEX ix_user_roles_role_active (role_id, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_approval_assignments (
    approval_assignment_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    approval_step_code VARCHAR(30) NOT NULL,
    approver_user_id BIGINT UNSIGNED NOT NULL,
    department_id BIGINT UNSIGNED NULL,
    position_id BIGINT UNSIGNED NULL,
    priority INT UNSIGNED NOT NULL DEFAULT 1,
    is_alternate BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from DATE NULL,
    valid_until DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_approval_assignments_step
        FOREIGN KEY (approval_step_code)
        REFERENCES tbl_approval_step_types(approval_step_code),
    CONSTRAINT fk_approval_assignments_user
        FOREIGN KEY (approver_user_id) REFERENCES tbl_user_accounts(user_id),
    CONSTRAINT fk_approval_assignments_department
        FOREIGN KEY (department_id) REFERENCES tbl_departments(department_id),
    CONSTRAINT fk_approval_assignments_position
        FOREIGN KEY (position_id) REFERENCES tbl_positions(position_id),
    INDEX ix_approval_assignment_lookup
        (approval_step_code, department_id, position_id, is_active, priority)
) ENGINE=InnoDB;

-- =========================================================
-- FLEET TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS tbl_drivers (
    driver_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    employee_record_id BIGINT UNSIGNED NULL UNIQUE,
    full_name VARCHAR(180) NOT NULL,
    driver_type_code VARCHAR(30) NOT NULL,
    license_number VARCHAR(80) NULL,
    license_expiry_date DATE NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_drivers_employee
        FOREIGN KEY (employee_record_id)
        REFERENCES tbl_employees(employee_record_id),
    CONSTRAINT fk_drivers_type
        FOREIGN KEY (driver_type_code)
        REFERENCES tbl_driver_types(driver_type_code),
    INDEX ix_drivers_active_name (is_active, full_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_vehicles (
    vehicle_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    vehicle_name VARCHAR(120) NOT NULL,
    plate_number VARCHAR(50) NOT NULL UNIQUE,
    vehicle_type VARCHAR(80) NULL,
    capacity INT UNSIGNED NULL,
    default_driver_id BIGINT UNSIGNED NULL,
    vehicle_status_code VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    remarks VARCHAR(500) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vehicles_default_driver
        FOREIGN KEY (default_driver_id) REFERENCES tbl_drivers(driver_id),
    CONSTRAINT fk_vehicles_status
        FOREIGN KEY (vehicle_status_code)
        REFERENCES tbl_vehicle_statuses(vehicle_status_code),
    INDEX ix_vehicles_status (vehicle_status_code, is_active)
) ENGINE=InnoDB;

-- =========================================================
-- GATE PASS WORKFLOW TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS tbl_gate_pass_requests (
    gate_pass_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    gate_pass_no VARCHAR(50) NOT NULL UNIQUE,
    requester_user_id BIGINT UNSIGNED NOT NULL,
    requester_employee_id BIGINT UNSIGNED NOT NULL,
    requester_department_id BIGINT UNSIGNED NOT NULL,
    requester_position_id BIGINT UNSIGNED NOT NULL,
    destination VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    expected_out_at DATETIME NOT NULL,
    expected_in_at DATETIME NULL,
    will_return BOOLEAN NOT NULL DEFAULT TRUE,
    vehicle_usage_code VARCHAR(30) NOT NULL DEFAULT 'NONE',
    vehicle_id BIGINT UNSIGNED NULL,
    private_vehicle_details VARCHAR(255) NULL,
    driver_id BIGINT UNSIGNED NULL,
    gate_pass_status_code VARCHAR(40) NOT NULL,
    requires_superior_approval BOOLEAN NOT NULL DEFAULT TRUE,
    requires_president_approval BOOLEAN NOT NULL DEFAULT FALSE,
    qr_token_hash CHAR(64) NULL UNIQUE,
    qr_expires_at DATETIME NULL,
    actual_out_at DATETIME NULL,
    actual_in_at DATETIME NULL,
    completed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_gate_pass_requester_user
        FOREIGN KEY (requester_user_id) REFERENCES tbl_user_accounts(user_id),
    CONSTRAINT fk_gate_pass_requester_employee
        FOREIGN KEY (requester_employee_id)
        REFERENCES tbl_employees(employee_record_id),
    CONSTRAINT fk_gate_pass_request_department
        FOREIGN KEY (requester_department_id)
        REFERENCES tbl_departments(department_id),
    CONSTRAINT fk_gate_pass_request_position
        FOREIGN KEY (requester_position_id) REFERENCES tbl_positions(position_id),
    CONSTRAINT fk_gate_pass_vehicle_usage
        FOREIGN KEY (vehicle_usage_code)
        REFERENCES tbl_vehicle_usage_types(vehicle_usage_code),
    CONSTRAINT fk_gate_pass_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES tbl_vehicles(vehicle_id),
    CONSTRAINT fk_gate_pass_driver
        FOREIGN KEY (driver_id) REFERENCES tbl_drivers(driver_id),
    CONSTRAINT fk_gate_pass_status
        FOREIGN KEY (gate_pass_status_code)
        REFERENCES tbl_gate_pass_statuses(gate_pass_status_code),
    INDEX ix_gate_pass_requester_status
        (requester_user_id, gate_pass_status_code, created_at),
    INDEX ix_gate_pass_department_status
        (requester_department_id, gate_pass_status_code, created_at),
    INDEX ix_gate_pass_security_queue
        (gate_pass_status_code, expected_out_at, expected_in_at),
    INDEX ix_gate_pass_vehicle_schedule
        (vehicle_id, expected_out_at, expected_in_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_gate_pass_approval_steps (
    approval_step_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    gate_pass_id BIGINT UNSIGNED NOT NULL,
    sequence_no INT UNSIGNED NOT NULL,
    approval_step_code VARCHAR(30) NOT NULL,
    assigned_approver_user_id BIGINT UNSIGNED NOT NULL,
    approval_status_code VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    comments VARCHAR(500) NULL,
    acted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_gate_pass_approval_request
        FOREIGN KEY (gate_pass_id)
        REFERENCES tbl_gate_pass_requests(gate_pass_id),
    CONSTRAINT fk_gate_pass_approval_step_type
        FOREIGN KEY (approval_step_code)
        REFERENCES tbl_approval_step_types(approval_step_code),
    CONSTRAINT fk_gate_pass_approval_user
        FOREIGN KEY (assigned_approver_user_id)
        REFERENCES tbl_user_accounts(user_id),
    CONSTRAINT fk_gate_pass_approval_status
        FOREIGN KEY (approval_status_code)
        REFERENCES tbl_approval_statuses(approval_status_code),
    UNIQUE KEY ux_gate_pass_approval_sequence (gate_pass_id, sequence_no),
    UNIQUE KEY ux_gate_pass_approval_step (gate_pass_id, approval_step_code),
    INDEX ix_approval_queue
        (assigned_approver_user_id, approval_status_code, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_signature_files (
    signature_file_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    width_percent INT NULL,
    y_offset INT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_signature_owner
        FOREIGN KEY (owner_user_id) REFERENCES tbl_user_accounts(user_id),
    INDEX ix_signature_owner_active (owner_user_id, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_approval_signatures (
    approval_step_id BIGINT UNSIGNED PRIMARY KEY,
    signature_file_id BIGINT UNSIGNED NOT NULL,
    attached_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_approval_signature_step
        FOREIGN KEY (approval_step_id)
        REFERENCES tbl_gate_pass_approval_steps(approval_step_id),
    CONSTRAINT fk_approval_signature_file
        FOREIGN KEY (signature_file_id)
        REFERENCES tbl_signature_files(signature_file_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_vehicle_reservations (
    reservation_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    gate_pass_id BIGINT UNSIGNED NOT NULL UNIQUE,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    driver_id BIGINT UNSIGNED NULL,
    reserved_from DATETIME NOT NULL,
    reserved_until DATETIME NULL,
    actual_out_at DATETIME NULL,
    actual_in_at DATETIME NULL,
    reservation_status_code VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vehicle_reservation_request
        FOREIGN KEY (gate_pass_id)
        REFERENCES tbl_gate_pass_requests(gate_pass_id),
    CONSTRAINT fk_vehicle_reservation_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES tbl_vehicles(vehicle_id),
    CONSTRAINT fk_vehicle_reservation_driver
        FOREIGN KEY (driver_id) REFERENCES tbl_drivers(driver_id),
    CONSTRAINT fk_vehicle_reservation_status
        FOREIGN KEY (reservation_status_code)
        REFERENCES tbl_reservation_statuses(reservation_status_code),
    INDEX ix_vehicle_reservation_overlap
        (vehicle_id, reservation_status_code, reserved_from, reserved_until)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_gate_pass_scans (
    scan_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    gate_pass_id BIGINT UNSIGNED NULL,
    scanned_by_user_id BIGINT UNSIGNED NOT NULL,
    scan_method_code VARCHAR(30) NOT NULL,
    scan_action_code VARCHAR(30) NOT NULL,
    result_code VARCHAR(80) NOT NULL,
    message VARCHAR(255) NOT NULL,
    provided_identifier_hash CHAR(64) NULL,
    scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_scan_request
        FOREIGN KEY (gate_pass_id)
        REFERENCES tbl_gate_pass_requests(gate_pass_id),
    CONSTRAINT fk_scan_user
        FOREIGN KEY (scanned_by_user_id) REFERENCES tbl_user_accounts(user_id),
    CONSTRAINT fk_scan_method
        FOREIGN KEY (scan_method_code)
        REFERENCES tbl_scan_methods(scan_method_code),
    CONSTRAINT fk_scan_action
        FOREIGN KEY (scan_action_code)
        REFERENCES tbl_scan_actions(scan_action_code),
    INDEX ix_scans_request_time (gate_pass_id, scanned_at),
    INDEX ix_scans_guard_time (scanned_by_user_id, scanned_at),
    INDEX ix_scans_result_time (result_code, scanned_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_notifications (
    notification_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    message VARCHAR(500) NOT NULL,
    notification_type_code VARCHAR(80) NOT NULL,
    related_entity_type VARCHAR(80) NULL,
    related_entity_id BIGINT UNSIGNED NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL,
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES tbl_user_accounts(user_id),
    INDEX ix_notifications_user_read (user_id, is_read, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_audit_logs (
    audit_log_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    actor_user_id BIGINT UNSIGNED NULL,
    action_code VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,
    details_json JSON NULL,
    ip_address VARCHAR(80) NULL,
    user_agent VARCHAR(255) NULL,
    trace_id VARCHAR(100) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_actor
        FOREIGN KEY (actor_user_id) REFERENCES tbl_user_accounts(user_id),
    INDEX ix_audit_entity (entity_type, entity_id, created_at),
    INDEX ix_audit_actor_time (actor_user_id, created_at),
    INDEX ix_audit_action_time (action_code, created_at)
) ENGINE=InnoDB;

-- =========================================================
-- VIEWS
-- =========================================================

CREATE OR REPLACE VIEW view_security_gate_queue AS
SELECT
    gpr.gate_pass_id,
    gpr.gate_pass_no,
    gpr.gate_pass_status_code,
    gps.status_name,
    gpr.will_return,
    gpr.expected_out_at,
    gpr.expected_in_at,
    gpr.actual_out_at,
    gpr.actual_in_at,
    e.employee_id,
    e.full_name,
    d.department_name,
    v.vehicle_name,
    v.plate_number,
    dr.full_name AS driver_name
FROM tbl_gate_pass_requests gpr
JOIN tbl_gate_pass_statuses gps
    ON gps.gate_pass_status_code = gpr.gate_pass_status_code
JOIN tbl_employees e
    ON e.employee_record_id = gpr.requester_employee_id
JOIN tbl_departments d
    ON d.department_id = gpr.requester_department_id
LEFT JOIN tbl_vehicles v
    ON v.vehicle_id = gpr.vehicle_id
LEFT JOIN tbl_drivers dr
    ON dr.driver_id = gpr.driver_id
WHERE gps.allows_qr_scan = TRUE;

CREATE OR REPLACE VIEW view_vehicle_availability AS
SELECT
    v.vehicle_id,
    v.vehicle_name,
    v.plate_number,
    v.vehicle_type,
    v.vehicle_status_code,
    CASE
        WHEN vs.is_selectable = FALSE THEN v.vehicle_status_code
        WHEN EXISTS (
            SELECT 1
            FROM tbl_vehicle_reservations vr
            JOIN tbl_reservation_statuses rs
                ON rs.reservation_status_code = vr.reservation_status_code
            WHERE vr.vehicle_id = v.vehicle_id
              AND rs.blocks_availability = TRUE
              AND vr.reservation_status_code IN ('IN_USE', 'OVERDUE')
        ) THEN 'IN_USE'
        WHEN EXISTS (
            SELECT 1
            FROM tbl_vehicle_reservations vr
            JOIN tbl_reservation_statuses rs
                ON rs.reservation_status_code = vr.reservation_status_code
            WHERE vr.vehicle_id = v.vehicle_id
              AND rs.blocks_availability = TRUE
        ) THEN 'RESERVED'
        ELSE 'AVAILABLE'
    END AS availability_status_code
FROM tbl_vehicles v
JOIN tbl_vehicle_statuses vs
    ON vs.vehicle_status_code = v.vehicle_status_code
WHERE v.is_active = TRUE;

CREATE OR REPLACE VIEW view_gate_pass_approval_progress AS
SELECT
    gpr.gate_pass_id,
    gpr.gate_pass_no,
    gpr.gate_pass_status_code,
    MAX(CASE
        WHEN gas.approval_step_code = 'SUPERIOR'
         AND gas.approval_status_code = 'APPROVED'
        THEN gas.acted_at END) AS superior_approved_at,
    MAX(CASE
        WHEN gas.approval_step_code = 'PRESIDENT'
         AND gas.approval_status_code = 'APPROVED'
        THEN gas.acted_at END) AS president_approved_at,
    MAX(CASE
        WHEN gas.approval_step_code = 'PAS'
         AND gas.approval_status_code = 'APPROVED'
        THEN gas.acted_at END) AS pas_noted_at
FROM tbl_gate_pass_requests gpr
LEFT JOIN tbl_gate_pass_approval_steps gas
    ON gas.gate_pass_id = gpr.gate_pass_id
GROUP BY
    gpr.gate_pass_id,
    gpr.gate_pass_no,
    gpr.gate_pass_status_code;
