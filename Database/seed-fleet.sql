USE gate_pass_system;

INSERT INTO tbl_drivers (
    employee_record_id,
    full_name,
    driver_type_code,
    is_active
)
SELECT
    NULL,
    'JONATHAN TURRECHA',
    'EXTERNAL',
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM tbl_drivers
    WHERE full_name = 'JONATHAN TURRECHA'
);

INSERT INTO tbl_drivers (
    employee_record_id,
    full_name,
    driver_type_code,
    is_active
)
SELECT
    NULL,
    'FRANCIS REFE',
    'EXTERNAL',
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM tbl_drivers
    WHERE full_name = 'FRANCIS REFE'
);

UPDATE tbl_drivers
SET is_active = TRUE
WHERE full_name IN ('JONATHAN TURRECHA', 'FRANCIS REFE');

UPDATE tbl_drivers
SET is_active = FALSE
WHERE full_name LIKE 'JOHN NEIL%VALENCIA%';

INSERT INTO tbl_vehicles (
    vehicle_name,
    plate_number,
    vehicle_type,
    default_driver_id,
    vehicle_status_code,
    remarks,
    is_active
) VALUES
(
    'HONDA CRV',
    'NOV-8084',
    'SUV',
    (
        SELECT driver_id
        FROM tbl_drivers
        WHERE full_name = 'JONATHAN TURRECHA'
          AND is_active = TRUE
        LIMIT 1
    ),
    'AVAILABLE',
    'Coding day: Tuesday',
    TRUE
),
(
    'HONDA ACCORD',
    'DAH-7724',
    'SEDAN',
    (
        SELECT driver_row.driver_id
        FROM tbl_drivers driver_row
        JOIN tbl_employees employee
            ON employee.employee_record_id =
               driver_row.employee_record_id
        WHERE employee.employee_id = 'GA108'
          AND driver_row.is_active = TRUE
        LIMIT 1
    ),
    'AVAILABLE',
    'Coding day: Tuesday',
    TRUE
),
(
    'HONDA HRV',
    'DBP-7296',
    'SUV',
    (
        SELECT driver_id
        FROM tbl_drivers
        WHERE full_name = 'FRANCIS REFE'
          AND is_active = TRUE
        LIMIT 1
    ),
    'AVAILABLE',
    'Coding day: Wednesday',
    TRUE
),
(
    'HONDA BRV',
    'DAZ-7569',
    'MPV',
    NULL,
    'AVAILABLE',
    'Coding day: Friday. Previous assigned driver is no longer active.',
    TRUE
),
(
    'HONDA CITY',
    'VHF-561',
    'SEDAN',
    NULL,
    'AVAILABLE',
    'Coding day: Monday',
    TRUE
),
(
    'TOYOTA INNOVA',
    'WVO-408',
    'MPV',
    NULL,
    'AVAILABLE',
    'Coding day: Thursday',
    TRUE
),
(
    'ISUZU TRUCK',
    'NAW-3504',
    'TRUCK',
    NULL,
    'AVAILABLE',
    'Coding day: Tuesday',
    TRUE
),
(
    'ISUZU TRUCK',
    'ZJE-745',
    'TRUCK',
    NULL,
    'AVAILABLE',
    'Coding day: Wednesday',
    TRUE
),
(
    'FUSO TRUCK',
    'DAV-3864',
    'TRUCK',
    NULL,
    'AVAILABLE',
    'Coding day: Tuesday',
    TRUE
)
ON DUPLICATE KEY UPDATE
    vehicle_name = VALUES(vehicle_name),
    vehicle_type = VALUES(vehicle_type),
    default_driver_id = VALUES(default_driver_id),
    vehicle_status_code = 'AVAILABLE',
    remarks = VALUES(remarks),
    is_active = TRUE;
