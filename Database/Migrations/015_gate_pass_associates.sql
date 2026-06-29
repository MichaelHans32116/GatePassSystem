USE gate_pass_system;

-- =========================================================
-- Phase 11 / Requirement 5
-- Support more than one associate/companion on a gate pass.
-- The PRIMARY associate continues to live on
-- tbl_gate_pass_requests.authorized_employee_id /
-- authorized_department_id and is mirrored here as line_no = 1.
-- Additional companions are stored as line_no = 2..N.
-- Companions are chosen from the employee directory, so they
-- normally have an employee_id; full_name is captured for display
-- and as a fallback when the employee link is NULL.
-- =========================================================

CREATE TABLE IF NOT EXISTS tbl_gate_pass_associates (
    associate_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    gate_pass_id BIGINT UNSIGNED NOT NULL,
    line_no INT UNSIGNED NOT NULL,
    employee_id BIGINT UNSIGNED NULL,
    department_id BIGINT UNSIGNED NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_gate_pass_associate_request
        FOREIGN KEY (gate_pass_id)
        REFERENCES tbl_gate_pass_requests(gate_pass_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_gate_pass_associate_employee
        FOREIGN KEY (employee_id)
        REFERENCES tbl_employees(employee_record_id),
    CONSTRAINT fk_gate_pass_associate_department
        FOREIGN KEY (department_id)
        REFERENCES tbl_departments(department_id),
    UNIQUE KEY ux_gate_pass_associate_line (gate_pass_id, line_no),
    INDEX ix_gate_pass_associate_employee (employee_id)
) ENGINE=InnoDB;

-- Backfill: every existing gate pass that already has a single
-- authorized employee becomes its own line_no = 1 associate.
-- Idempotent via the UNIQUE(gate_pass_id, line_no) key.
INSERT INTO tbl_gate_pass_associates (
    gate_pass_id,
    line_no,
    employee_id,
    department_id,
    full_name
)
SELECT
    gpr.gate_pass_id,
    1 AS line_no,
    gpr.authorized_employee_id,
    gpr.authorized_department_id,
    COALESCE(authorized_employee.full_name, 'Unknown') AS full_name
FROM tbl_gate_pass_requests gpr
LEFT JOIN tbl_employees authorized_employee
    ON authorized_employee.employee_record_id = gpr.authorized_employee_id
WHERE gpr.authorized_employee_id IS NOT NULL
ON DUPLICATE KEY UPDATE
    employee_id = VALUES(employee_id),
    department_id = VALUES(department_id),
    full_name = VALUES(full_name);

-- Register schema version 015
INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '015',
    'Create tbl_gate_pass_associates for multiple associates/companions per gate pass.',
    'Database/Migrations/015_gate_pass_associates.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
