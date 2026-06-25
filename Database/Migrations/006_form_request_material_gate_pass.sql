USE gate_pass_system;

CREATE TABLE IF NOT EXISTS tbl_form_types (
    form_type_code VARCHAR(40) PRIMARY KEY,
    form_name VARCHAR(120) NOT NULL,
    description VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

INSERT INTO tbl_form_types (
    form_type_code,
    form_name,
    description,
    sort_order
) VALUES
(
    'PERSON_GATE_PASS',
    'Person Gate Pass',
    'Gate pass for an associate leaving and returning to the company premises.',
    10
),
(
    'MATERIAL_GATE_PASS',
    'Material Gate Pass',
    'Gate pass authorizing an employee to bring listed materials out of the premises.',
    20
)
ON DUPLICATE KEY UPDATE
    form_name = VALUES(form_name),
    description = VALUES(description),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

ALTER TABLE tbl_approval_assignments
    ADD COLUMN form_type_code VARCHAR(40) NULL
        AFTER approval_step_code,
    ADD CONSTRAINT fk_approval_assignments_form_type
        FOREIGN KEY (form_type_code)
        REFERENCES tbl_form_types(form_type_code);

ALTER TABLE tbl_approval_assignments
    ADD INDEX ix_approval_assignment_form_lookup (
        approval_step_code,
        form_type_code,
        department_id,
        position_id,
        is_active,
        priority
    );

ALTER TABLE tbl_gate_pass_requests
    ADD COLUMN form_type_code VARCHAR(40) NOT NULL
        DEFAULT 'PERSON_GATE_PASS'
        AFTER gate_pass_no,
    ADD COLUMN control_no VARCHAR(20) NULL
        AFTER form_type_code,
    ADD COLUMN form_date DATE NULL
        AFTER control_no,
    ADD COLUMN prepared_by_signature_file_id BIGINT UNSIGNED NULL
        AFTER requester_position_id,
    ADD COLUMN authorized_employee_id BIGINT UNSIGNED NULL
        AFTER prepared_by_signature_file_id,
    ADD COLUMN authorized_department_id BIGINT UNSIGNED NULL
        AFTER authorized_employee_id,
    ADD COLUMN material_remarks VARCHAR(1000) NULL
        AFTER purpose,
    ADD CONSTRAINT fk_gate_pass_form_type
        FOREIGN KEY (form_type_code)
        REFERENCES tbl_form_types(form_type_code),
    ADD CONSTRAINT fk_gate_pass_authorized_employee
        FOREIGN KEY (authorized_employee_id)
        REFERENCES tbl_employees(employee_record_id),
    ADD CONSTRAINT fk_gate_pass_authorized_department
        FOREIGN KEY (authorized_department_id)
        REFERENCES tbl_departments(department_id);

UPDATE tbl_gate_pass_requests
SET form_type_code = 'PERSON_GATE_PASS',
    form_date = DATE(COALESCE(expected_out_at, applied_at, created_at))
WHERE form_date IS NULL
   OR form_type_code IS NULL;

DROP TEMPORARY TABLE IF EXISTS tmp_form_control_numbers;

CREATE TEMPORARY TABLE tmp_form_control_numbers (
    gate_pass_id BIGINT UNSIGNED PRIMARY KEY,
    control_no VARCHAR(20) NOT NULL
) ENGINE=MEMORY;

INSERT INTO tmp_form_control_numbers (
    gate_pass_id,
    control_no
)
SELECT
    request_row.gate_pass_id,
    CONCAT(
        DATE_FORMAT(
            DATE(COALESCE(
                request_row.applied_at,
                request_row.expected_out_at,
                request_row.created_at
            )),
            '%m%d%y'
        ),
        '-',
        LPAD((
            SELECT COUNT(*)
            FROM tbl_gate_pass_requests earlier_request
            WHERE DATE(COALESCE(
                      earlier_request.applied_at,
                      earlier_request.expected_out_at,
                      earlier_request.created_at
                  )) = DATE(COALESCE(
                      request_row.applied_at,
                      request_row.expected_out_at,
                      request_row.created_at
                  ))
              AND earlier_request.gate_pass_id <= request_row.gate_pass_id
        ), 3, '0')
    )
FROM tbl_gate_pass_requests request_row
WHERE request_row.control_no IS NULL;

UPDATE tbl_gate_pass_requests request_row
JOIN tmp_form_control_numbers generated
    ON generated.gate_pass_id = request_row.gate_pass_id
SET request_row.control_no = generated.control_no;

DROP TEMPORARY TABLE IF EXISTS tmp_form_control_numbers;

ALTER TABLE tbl_gate_pass_requests
    MODIFY form_date DATE NOT NULL,
    MODIFY control_no VARCHAR(20) NOT NULL,
    ADD UNIQUE KEY ux_gate_pass_control_no (control_no),
    ADD INDEX ix_gate_pass_form_type_status (
        form_type_code,
        gate_pass_status_code,
        created_at
    ),
    ADD INDEX ix_gate_pass_authorized_employee (
        authorized_employee_id,
        form_date
    );

CREATE TABLE IF NOT EXISTS tbl_form_control_sequences (
    control_date DATE PRIMARY KEY,
    last_sequence INT UNSIGNED NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO tbl_form_control_sequences (
    control_date,
    last_sequence
)
SELECT
    form_date,
    COUNT(*)
FROM tbl_gate_pass_requests
GROUP BY form_date
ON DUPLICATE KEY UPDATE
    last_sequence = GREATEST(
        tbl_form_control_sequences.last_sequence,
        VALUES(last_sequence)
    );

CREATE TABLE IF NOT EXISTS tbl_material_gate_pass_items (
    material_item_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    gate_pass_id BIGINT UNSIGNED NOT NULL,
    line_no INT UNSIGNED NOT NULL,
    item_no VARCHAR(80) NULL,
    description VARCHAR(500) NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_material_item_gate_pass
        FOREIGN KEY (gate_pass_id)
        REFERENCES tbl_gate_pass_requests(gate_pass_id),
    UNIQUE KEY ux_material_item_line (gate_pass_id, line_no),
    INDEX ix_material_item_description (description(120))
) ENGINE=InnoDB;

ALTER TABLE tbl_gate_pass_requests
    ADD CONSTRAINT fk_gate_pass_prepared_signature
        FOREIGN KEY (prepared_by_signature_file_id)
        REFERENCES tbl_signature_files(signature_file_id);

INSERT INTO tbl_user_roles (
    user_id,
    role_id,
    assigned_by_user_id,
    is_active
)
SELECT
    user_account.user_id,
    role_row.role_id,
    NULL,
    TRUE
FROM tbl_user_accounts user_account
JOIN tbl_employees employee
    ON employee.employee_record_id = user_account.employee_record_id
JOIN tbl_roles role_row
    ON role_row.role_code = 'PAS_NOTER'
WHERE employee.employee_id = 'GA409'
ON DUPLICATE KEY UPDATE
    is_active = TRUE;

INSERT INTO tbl_approval_assignments (
    approval_step_code,
    form_type_code,
    approver_user_id,
    department_id,
    position_id,
    priority,
    is_alternate,
    is_active
)
SELECT
    'PAS',
    'PERSON_GATE_PASS',
    user_account.user_id,
    NULL,
    NULL,
    4,
    TRUE,
    TRUE
FROM tbl_user_accounts user_account
JOIN tbl_employees employee
    ON employee.employee_record_id = user_account.employee_record_id
WHERE employee.employee_id = 'GA409'
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_approval_assignments existing
      WHERE existing.approval_step_code = 'PAS'
        AND existing.form_type_code = 'PERSON_GATE_PASS'
        AND existing.approver_user_id = user_account.user_id
  );

INSERT INTO tbl_approval_assignments (
    approval_step_code,
    form_type_code,
    approver_user_id,
    department_id,
    position_id,
    priority,
    is_alternate,
    is_active
)
SELECT
    'PAS',
    'MATERIAL_GATE_PASS',
    user_account.user_id,
    NULL,
    NULL,
    1,
    FALSE,
    TRUE
FROM tbl_user_accounts user_account
JOIN tbl_employees employee
    ON employee.employee_record_id = user_account.employee_record_id
WHERE employee.employee_id = 'GA409'
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_approval_assignments existing
      WHERE existing.approval_step_code = 'PAS'
        AND existing.form_type_code = 'MATERIAL_GATE_PASS'
        AND existing.approver_user_id = user_account.user_id
  );

CREATE OR REPLACE VIEW view_security_gate_queue AS
SELECT
    gpr.gate_pass_id,
    gpr.gate_pass_no,
    gpr.control_no,
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
WHERE gps.allows_qr_scan = TRUE
  AND gpr.form_type_code = 'PERSON_GATE_PASS';

CREATE OR REPLACE VIEW view_gate_pass_records AS
SELECT
    gpr.gate_pass_id,
    gpr.gate_pass_no,
    gpr.control_no,
    gpr.form_type_code,
    form_type.form_name,
    gpr.form_date,
    gpr.requester_user_id,
    gpr.requester_employee_id,
    gpr.prepared_by_signature_file_id,
    requester.employee_id,
    requester.full_name,
    requester_department.department_name,
    requester_position.position_name,
    gpr.authorized_employee_id,
    authorized_employee.employee_id AS authorized_employee_no,
    authorized_employee.full_name AS authorized_employee_name,
    gpr.authorized_department_id,
    authorized_department.department_name AS authorized_department_name,
    gpr.destination,
    gpr.purpose,
    gpr.material_remarks,
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
JOIN tbl_form_types form_type
    ON form_type.form_type_code = gpr.form_type_code
JOIN tbl_gate_pass_statuses gps
    ON gps.gate_pass_status_code = gpr.gate_pass_status_code
JOIN tbl_employees requester
    ON requester.employee_record_id = gpr.requester_employee_id
JOIN tbl_departments requester_department
    ON requester_department.department_id = gpr.requester_department_id
JOIN tbl_positions requester_position
    ON requester_position.position_id = gpr.requester_position_id
LEFT JOIN tbl_employees authorized_employee
    ON authorized_employee.employee_record_id = gpr.authorized_employee_id
LEFT JOIN tbl_departments authorized_department
    ON authorized_department.department_id = gpr.authorized_department_id;

INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '006',
    'Generalize the app into a form request system and add material gate passes.',
    'Database/Migrations/006_form_request_material_gate_pass.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
