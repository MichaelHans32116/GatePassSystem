USE gate_pass_system;

ALTER TABLE tbl_gate_pass_requests
    ADD COLUMN actual_out_signature_file_id BIGINT UNSIGNED NULL AFTER actual_out_at,
    ADD COLUMN actual_in_signature_file_id BIGINT UNSIGNED NULL AFTER actual_in_at,
    ADD CONSTRAINT fk_gate_pass_actual_out_signature FOREIGN KEY (actual_out_signature_file_id) REFERENCES tbl_signature_files(signature_file_id),
    ADD CONSTRAINT fk_gate_pass_actual_in_signature FOREIGN KEY (actual_in_signature_file_id) REFERENCES tbl_signature_files(signature_file_id);

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
    gpr.actual_out_signature_file_id,
    gpr.actual_in_signature_file_id,
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
    '010',
    'Add actual out/in guard signature columns and update view_gate_pass_records.',
    'Database/Migrations/010_add_guard_signatures.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
