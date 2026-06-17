-- Gate Pass System database draft for MySQL 8+
-- This is the target normalized schema for migrating the current index.html prototype.

CREATE TABLE IF NOT EXISTS roles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id),
    CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id)
);

CREATE TABLE IF NOT EXISTS departments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS positions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    department_id BIGINT NULL,
    name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_positions_department FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    employee_id VARCHAR(50) NOT NULL UNIQUE,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role_id BIGINT NOT NULL,
    department_id BIGINT NULL,
    position_id BIGINT NULL,
    date_hired DATE NULL,
    account_status ENUM('Active', 'Archived', 'Locked') NOT NULL DEFAULT 'Active',
    last_login_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
    CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT fk_users_position FOREIGN KEY (position_id) REFERENCES positions(id)
);

CREATE TABLE IF NOT EXISTS drivers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(150) NOT NULL,
    employee_id VARCHAR(50) NULL,
    is_company_employee BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    plate_number VARCHAR(50) NOT NULL UNIQUE,
    coding_day ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'None') NULL,
    default_driver_id BIGINT NULL,
    vehicle_status ENUM('Available', 'InUse', 'Maintenance', 'Archived') NOT NULL DEFAULT 'Available',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vehicles_default_driver FOREIGN KEY (default_driver_id) REFERENCES drivers(id)
);

CREATE TABLE IF NOT EXISTS gate_pass_requests (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    gate_pass_no VARCHAR(50) NOT NULL UNIQUE,
    requester_id BIGINT NOT NULL,
    department_id BIGINT NULL,
    destination VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    expected_out_at DATETIME NOT NULL,
    expected_in_at DATETIME NULL,
    will_return BOOLEAN NOT NULL DEFAULT TRUE,
    needs_vehicle BOOLEAN NOT NULL DEFAULT FALSE,
    vehicle_id BIGINT NULL,
    manual_vehicle VARCHAR(150) NULL,
    driver_id BIGINT NULL,
    manual_driver VARCHAR(150) NULL,
    requires_superior_approval BOOLEAN NOT NULL DEFAULT FALSE,
    requires_president_approval BOOLEAN NOT NULL DEFAULT FALSE,
    status ENUM(
        'PendingSuperior',
        'PendingPresident',
        'PendingPAS',
        'Approved',
        'Outside',
        'Returned',
        'Closed',
        'Rejected',
        'Cancelled',
        'Expired'
    ) NOT NULL,
    qr_token_hash VARCHAR(255) NULL,
    actual_out_at DATETIME NULL,
    actual_in_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_gate_pass_requester FOREIGN KEY (requester_id) REFERENCES users(id),
    CONSTRAINT fk_gate_pass_department FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT fk_gate_pass_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    CONSTRAINT fk_gate_pass_driver FOREIGN KEY (driver_id) REFERENCES drivers(id),
    INDEX ix_gate_pass_requester_status (requester_id, status),
    INDEX ix_gate_pass_department_status (department_id, status),
    INDEX ix_gate_pass_status_created (status, created_at)
);

CREATE TABLE IF NOT EXISTS signature_files (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    owner_user_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    width_percent INT NULL,
    y_offset INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_signature_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS gate_pass_approvals (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    gate_pass_request_id BIGINT NOT NULL,
    approval_step ENUM('Superior', 'President', 'PAS') NOT NULL,
    approver_user_id BIGINT NOT NULL,
    action ENUM('Approved', 'Rejected') NOT NULL,
    signature_file_id BIGINT NULL,
    comments VARCHAR(500) NULL,
    acted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_approval_request FOREIGN KEY (gate_pass_request_id) REFERENCES gate_pass_requests(id),
    CONSTRAINT fk_approval_approver FOREIGN KEY (approver_user_id) REFERENCES users(id),
    CONSTRAINT fk_approval_signature FOREIGN KEY (signature_file_id) REFERENCES signature_files(id),
    UNIQUE KEY ux_approval_step_once (gate_pass_request_id, approval_step)
);

CREATE TABLE IF NOT EXISTS gate_pass_scans (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    gate_pass_request_id BIGINT NOT NULL,
    scanned_by_user_id BIGINT NOT NULL,
    scan_action ENUM('TimeOut', 'TimeIn', 'ManualVerify', 'RejectedAttempt') NOT NULL,
    result_code VARCHAR(80) NOT NULL,
    message VARCHAR(255) NOT NULL,
    scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_scan_request FOREIGN KEY (gate_pass_request_id) REFERENCES gate_pass_requests(id),
    CONSTRAINT fk_scan_user FOREIGN KEY (scanned_by_user_id) REFERENCES users(id),
    INDEX ix_scans_request_time (gate_pass_request_id, scanned_at)
);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(150) NOT NULL,
    message VARCHAR(500) NOT NULL,
    notification_type VARCHAR(80) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX ix_notifications_user_read (user_id, is_read, created_at)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    actor_user_id BIGINT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id BIGINT NULL,
    details_json JSON NULL,
    ip_address VARCHAR(80) NULL,
    user_agent VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
    INDEX ix_audit_entity (entity_type, entity_id),
    INDEX ix_audit_actor_time (actor_user_id, created_at)
);

CREATE OR REPLACE VIEW vw_security_gate_queue AS
SELECT
    gpr.id,
    gpr.gate_pass_no,
    gpr.status,
    gpr.will_return,
    gpr.expected_out_at,
    gpr.expected_in_at,
    gpr.actual_out_at,
    gpr.actual_in_at,
    u.employee_id,
    u.full_name,
    d.name AS department_name,
    v.name AS vehicle_name,
    v.plate_number
FROM gate_pass_requests gpr
JOIN users u ON u.id = gpr.requester_id
LEFT JOIN departments d ON d.id = gpr.department_id
LEFT JOIN vehicles v ON v.id = gpr.vehicle_id
WHERE gpr.status IN ('Approved', 'Outside');

CREATE OR REPLACE VIEW vw_gate_pass_approval_progress AS
SELECT
    gpr.id AS gate_pass_request_id,
    gpr.gate_pass_no,
    gpr.status,
    MAX(CASE WHEN gpa.approval_step = 'Superior' THEN gpa.acted_at END) AS superior_approved_at,
    MAX(CASE WHEN gpa.approval_step = 'President' THEN gpa.acted_at END) AS president_approved_at,
    MAX(CASE WHEN gpa.approval_step = 'PAS' THEN gpa.acted_at END) AS pas_noted_at
FROM gate_pass_requests gpr
LEFT JOIN gate_pass_approvals gpa ON gpa.gate_pass_request_id = gpr.id
GROUP BY gpr.id, gpr.gate_pass_no, gpr.status;
