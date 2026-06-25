USE gate_pass_system;

-- Update existing gate pass numbers for material gate passes to GP- format
UPDATE tbl_gate_pass_requests
SET gate_pass_no = REPLACE(gate_pass_no, 'MGP-', 'GP-')
WHERE gate_pass_no LIKE 'MGP-%';

-- Update view_security_gate_queue to select e.employee_record_id
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
    e.employee_record_id,
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
    ON e.employee_record_id = COALESCE(gpr.authorized_employee_id, gpr.requester_employee_id)
JOIN tbl_departments d
    ON d.department_id = COALESCE(gpr.authorized_department_id, gpr.requester_department_id)
LEFT JOIN tbl_vehicles v
    ON v.vehicle_id = gpr.vehicle_id
LEFT JOIN tbl_drivers dr
    ON dr.driver_id = gpr.driver_id
WHERE gps.allows_qr_scan = TRUE;

INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '011',
    'Unify control numbers to GP prefix and add employee_record_id to security queue view.',
    'Database/Migrations/011_unify_control_numbers_and_view.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
