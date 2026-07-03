USE gate_pass_system;

-- =========================================================
-- Phase 11.11 / Sync the recurring fixed vehicle schedule
-- with the March 30 - April 4, 2026 workbook reference.
--
-- The workbook keeps the Saturday OUT window for the BRV
-- later than the weekday OUT window, and it also includes a
-- Saturday morning IN window for the Accord row.
-- =========================================================

UPDATE tbl_fixed_vehicle_schedules fs
JOIN tbl_vehicles v
    ON v.vehicle_id = fs.vehicle_id
SET fs.start_time = '17:30:00',
    fs.end_time = '18:00:00',
    fs.schedule_type = 'RECURRING'
WHERE fs.is_active = TRUE
  AND v.plate_number = 'DAZ-7569'
  AND fs.day_of_week = 6
  AND fs.title = 'OUT of Ms. L. Solas'
  AND fs.start_time = '16:30:00'
  AND fs.end_time = '17:00:00';

UPDATE tbl_fixed_vehicle_schedules fs
JOIN tbl_vehicles v
    ON v.vehicle_id = fs.vehicle_id
JOIN tbl_drivers d
    ON d.full_name = 'GERONIMO M. LAMBINO II'
   AND d.is_active = TRUE
SET fs.start_time = '06:00:00',
    fs.end_time = '06:30:00',
    fs.title = 'IN of Ms. N. Rodulfo',
    fs.schedule_type = 'RECURRING',
    fs.driver_id = d.driver_id
WHERE fs.is_active = TRUE
  AND v.plate_number = 'DAH-7724'
  AND fs.day_of_week = 6
  AND fs.title = 'IN of Ms. N. Rodulfo';

UPDATE tbl_fixed_vehicle_schedules fs
JOIN tbl_vehicles v
    ON v.vehicle_id = fs.vehicle_id
JOIN tbl_drivers d
    ON d.full_name = 'JOHN NEIL VALENCIA'
   AND d.is_active = TRUE
SET fs.start_time = '17:30:00',
    fs.end_time = '18:00:00',
    fs.title = 'OUT of Ms. L. Solas',
    fs.schedule_type = 'RECURRING',
    fs.driver_id = d.driver_id
WHERE fs.is_active = TRUE
  AND v.plate_number = 'DAZ-7569'
  AND fs.day_of_week = 6
  AND fs.title = 'OUT of Ms. L. Solas'
  AND fs.start_time = '16:30:00'
  AND fs.end_time = '17:00:00';

INSERT INTO tbl_fixed_vehicle_schedules (
    vehicle_id,
    driver_id,
    day_of_week,
    start_time,
    end_time,
    title,
    description,
    schedule_type,
    is_active
)
SELECT
    v.vehicle_id,
    d.driver_id,
    6,
    '06:00:00',
    '06:30:00',
    'IN of Ms. N. Rodulfo',
    NULL,
    'RECURRING',
    TRUE
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d
    ON d.full_name = 'GERONIMO M. LAMBINO II'
   AND d.is_active = TRUE
WHERE v.plate_number = 'DAH-7724'
  AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_fixed_vehicle_schedules fs
      WHERE fs.vehicle_id = v.vehicle_id
        AND fs.day_of_week = 6
        AND fs.start_time = '06:00:00'
        AND fs.end_time = '06:30:00'
      AND fs.title = 'IN of Ms. N. Rodulfo'
        AND fs.is_active = TRUE
  );

INSERT INTO tbl_fixed_vehicle_schedules (
    vehicle_id,
    driver_id,
    day_of_week,
    start_time,
    end_time,
    title,
    description,
    schedule_type,
    is_active
)
SELECT
    v.vehicle_id,
    d.driver_id,
    6,
    '17:30:00',
    '18:00:00',
    'OUT of Ms. L. Solas',
    NULL,
    'RECURRING',
    TRUE
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d
    ON d.full_name = 'JOHN NEIL VALENCIA'
   AND d.is_active = TRUE
WHERE v.plate_number = 'DAZ-7569'
  AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_fixed_vehicle_schedules fs
      WHERE fs.vehicle_id = v.vehicle_id
        AND fs.day_of_week = 6
        AND fs.start_time = '17:30:00'
        AND fs.end_time = '18:00:00'
        AND fs.title = 'OUT of Ms. L. Solas'
        AND fs.is_active = TRUE
  );

-- Register schema version 019
INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '019',
    'Sync recurring fixed vehicle schedule rows with the workbook reference.',
    'Database/Migrations/019_sync_fixed_vehicle_schedule_with_workbook.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
