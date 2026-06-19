USE gate_pass_system;

ALTER TABLE tbl_gate_pass_requests
    ADD COLUMN applied_at DATETIME NULL AFTER qr_expires_at,
    ADD COLUMN approval_completed_at DATETIME NULL AFTER applied_at,
    ADD COLUMN approved_at DATETIME NULL AFTER approval_completed_at,
    ADD COLUMN rejected_at DATETIME NULL AFTER approved_at,
    ADD COLUMN cancelled_at DATETIME NULL AFTER rejected_at,
    ADD COLUMN expired_at DATETIME NULL AFTER cancelled_at,
    ADD COLUMN version_no INT UNSIGNED NOT NULL DEFAULT 1 AFTER completed_at,
    ADD INDEX ix_gate_pass_applied (applied_at, gate_pass_status_code),
    ADD INDEX ix_gate_pass_approval_completed
        (approval_completed_at, gate_pass_status_code),
    ADD INDEX ix_gate_pass_transaction_completed
        (completed_at, gate_pass_status_code);

CREATE TABLE tbl_gate_pass_status_history (
    status_history_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    gate_pass_id BIGINT UNSIGNED NOT NULL,
    from_status_code VARCHAR(40) NULL,
    to_status_code VARCHAR(40) NOT NULL,
    changed_by_user_id BIGINT UNSIGNED NULL,
    remarks VARCHAR(500) NULL,
    trace_id VARCHAR(100) NULL,
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gate_pass_history_request
        FOREIGN KEY (gate_pass_id)
        REFERENCES tbl_gate_pass_requests(gate_pass_id),
    CONSTRAINT fk_gate_pass_history_from_status
        FOREIGN KEY (from_status_code)
        REFERENCES tbl_gate_pass_statuses(gate_pass_status_code),
    CONSTRAINT fk_gate_pass_history_to_status
        FOREIGN KEY (to_status_code)
        REFERENCES tbl_gate_pass_statuses(gate_pass_status_code),
    CONSTRAINT fk_gate_pass_history_changed_by
        FOREIGN KEY (changed_by_user_id)
        REFERENCES tbl_user_accounts(user_id),
    INDEX ix_gate_pass_history_request_time
        (gate_pass_id, changed_at),
    INDEX ix_gate_pass_history_status_time
        (to_status_code, changed_at)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW view_gate_pass_records AS
SELECT
    gpr.gate_pass_id,
    gpr.gate_pass_no,
    gpr.requester_user_id,
    e.employee_id,
    e.full_name,
    d.department_name,
    p.position_name,
    gpr.destination,
    gpr.purpose,
    gpr.gate_pass_status_code,
    gps.status_name,
    gps.status_group,
    gpr.applied_at,
    gpr.approval_completed_at,
    gpr.approved_at,
    gpr.rejected_at,
    gpr.cancelled_at,
    gpr.expired_at,
    gpr.expected_out_at,
    gpr.expected_in_at,
    gpr.actual_out_at,
    gpr.actual_in_at,
    gpr.completed_at,
    CASE
        WHEN gpr.approved_at IS NOT NULL THEN 'APPROVED'
        WHEN gpr.rejected_at IS NOT NULL THEN 'REJECTED'
        WHEN gpr.cancelled_at IS NOT NULL THEN 'CANCELLED'
        WHEN gpr.expired_at IS NOT NULL THEN 'EXPIRED'
        ELSE NULL
    END AS application_outcome_code,
    gpr.created_at,
    gpr.updated_at
FROM tbl_gate_pass_requests gpr
JOIN tbl_gate_pass_statuses gps
    ON gps.gate_pass_status_code = gpr.gate_pass_status_code
JOIN tbl_employees e
    ON e.employee_record_id = gpr.requester_employee_id
JOIN tbl_departments d
    ON d.department_id = gpr.requester_department_id
JOIN tbl_positions p
    ON p.position_id = gpr.requester_position_id;

INSERT INTO tbl_schema_versions (
    version_no, description, script_name
) VALUES (
    '002',
    'Add gate pass application, approval outcome, completion timestamps, and status history.',
    'Database/Migrations/002_gate_pass_lifecycle_timestamps.sql'
);
