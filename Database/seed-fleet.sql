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

INSERT INTO tbl_drivers (
    employee_record_id,
    full_name,
    driver_type_code,
    is_active
)
SELECT
    employee.employee_record_id,
    'GERONIMO M. LAMBINO II',
    'EXTERNAL',
    TRUE
FROM tbl_employees employee
WHERE employee.employee_id = 'GA108'
  AND NOT EXISTS (
    SELECT 1
    FROM tbl_drivers
    WHERE employee_record_id = employee.employee_record_id
       OR full_name = 'GERONIMO M. LAMBINO II'
);

INSERT INTO tbl_drivers (
    employee_record_id,
    full_name,
    driver_type_code,
    is_active
)
SELECT
    NULL,
    'JOHN NEIL VALENCIA',
    'EXTERNAL',
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM tbl_drivers
    WHERE full_name = 'JOHN NEIL VALENCIA'
);

INSERT INTO tbl_drivers (
    employee_record_id,
    full_name,
    driver_type_code,
    is_active
)
SELECT
    NULL,
    'ALEX',
    'EXTERNAL',
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM tbl_drivers
    WHERE full_name = 'ALEX'
);

INSERT INTO tbl_drivers (
    employee_record_id,
    full_name,
    driver_type_code,
    is_active
)
SELECT
    NULL,
    'ALVIN',
    'EXTERNAL',
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM tbl_drivers
    WHERE full_name = 'ALVIN'
);

UPDATE tbl_drivers
SET is_active = TRUE
WHERE full_name IN (
    'JONATHAN TURRECHA',
    'FRANCIS REFE',
    'GERONIMO M. LAMBINO II',
    'JOHN NEIL VALENCIA',
    'ALEX',
    'ALVIN'
);

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
        SELECT driver_id
        FROM tbl_drivers
        WHERE full_name = 'GERONIMO M. LAMBINO II'
          AND is_active = TRUE
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
    (
        SELECT driver_id
        FROM tbl_drivers
        WHERE full_name = 'JOHN NEIL VALENCIA'
          AND is_active = TRUE
        LIMIT 1
    ),
    'AVAILABLE',
    'Coding day: Friday',
    TRUE
),
(
    'HONDA CITY',
    'VHF-561',
    'SEDAN',
    (
        SELECT driver_id
        FROM tbl_drivers
        WHERE full_name = 'GERONIMO M. LAMBINO II'
          AND is_active = TRUE
        LIMIT 1
    ),
    'AVAILABLE',
    'Coding day: Monday',
    TRUE
),
(
    'TOYOTA INNOVA',
    'WVO-408',
    'MPV',
    (
        SELECT driver_id
        FROM tbl_drivers
        WHERE full_name = 'JONATHAN TURRECHA'
          AND is_active = TRUE
        LIMIT 1
    ),
    'AVAILABLE',
    'Coding day: Thursday',
    TRUE
),
(
    'FLEXI VAN',
    'NAW-3504',
    'TRUCK',
    (
        SELECT driver_id
        FROM tbl_drivers
        WHERE full_name = 'FRANCIS REFE'
          AND is_active = TRUE
        LIMIT 1
    ),
    'AVAILABLE',
    'Coding day: Tuesday',
    TRUE
),
(
    'ISUZU CANTER',
    'ZJE-745',
    'TRUCK',
    (
        SELECT driver_id
        FROM tbl_drivers
        WHERE full_name = 'ALEX'
          AND is_active = TRUE
        LIMIT 1
    ),
    'AVAILABLE',
    'Coding day: Wednesday',
    TRUE
),
(
    'MITSUBISHI FUSO',
    'DAV-3864',
    'TRUCK',
    (
        SELECT driver_id
        FROM tbl_drivers
        WHERE full_name = 'ALVIN'
          AND is_active = TRUE
        LIMIT 1
    ),
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
