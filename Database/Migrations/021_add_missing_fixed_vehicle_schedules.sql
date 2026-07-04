USE gate_pass_system;

-- =========================================================
-- Phase 11.9 / Add missing afternoon OUT schedules and 
-- Saturday IN/OUT schedules consistent with the latest workbook.
-- =========================================================

-- 1. HONDA CRV (NOV-8084 / JONATHAN TURRECHA)
-- IN: Saturday 6:00 - 6:30
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, 6, '06:00:00', '06:30:00', 'IN of Mr. Maekawa', 'RECURRING'
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'NOV-8084' AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM tbl_fixed_vehicle_schedules fs 
      WHERE fs.vehicle_id = v.vehicle_id AND fs.day_of_week = 6 AND fs.start_time = '06:00:00' AND fs.title = 'IN of Mr. Maekawa' AND fs.is_active = TRUE
  );

-- OUT: Monday to Friday 17:00 - 18:00 (consistent afternoon out)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '17:00:00', '18:00:00', 'OUT of Mr. Maekawa', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'NOV-8084' AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM tbl_fixed_vehicle_schedules fs 
      WHERE fs.vehicle_id = v.vehicle_id AND fs.day_of_week = dow.d AND fs.start_time = '17:00:00' AND fs.title = 'OUT of Mr. Maekawa' AND fs.is_active = TRUE
  );

-- OUT: Saturday 16:30 - 18:00 (afternoon out)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, 6, '16:30:00', '18:00:00', 'OUT of Mr. Maekawa', 'RECURRING'
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'NOV-8084' AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM tbl_fixed_vehicle_schedules fs 
      WHERE fs.vehicle_id = v.vehicle_id AND fs.day_of_week = 6 AND fs.start_time = '16:30:00' AND fs.title = 'OUT of Mr. Maekawa' AND fs.is_active = TRUE
  );


-- 2. HONDA HRV (DBP-7296 / FRANCIS REFE)
-- IN: Saturday 6:00 - 6:30
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, 6, '06:00:00', '06:30:00', 'IN of Mr. Nishimori and Mr. Shudo', 'RECURRING'
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d ON d.full_name = 'FRANCIS REFE' AND d.is_active = TRUE
WHERE v.plate_number = 'DBP-7296' AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM tbl_fixed_vehicle_schedules fs 
      WHERE fs.vehicle_id = v.vehicle_id AND fs.day_of_week = 6 AND fs.start_time = '06:00:00' AND fs.title = 'IN of Mr. Nishimori and Mr. Shudo' AND fs.is_active = TRUE
  );

-- OUT: Monday to Friday 16:30 - 17:30 (consistent afternoon out)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '16:30:00', '17:30:00', 'OUT of Mr. Nishimori and Mr. Shudo', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'FRANCIS REFE' AND d.is_active = TRUE
WHERE v.plate_number = 'DBP-7296' AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM tbl_fixed_vehicle_schedules fs 
      WHERE fs.vehicle_id = v.vehicle_id AND fs.day_of_week = dow.d AND fs.start_time = '16:30:00' AND fs.title = 'OUT of Mr. Nishimori and Mr. Shudo' AND fs.is_active = TRUE
  );

-- OUT: Saturday 16:30 - 18:00 (afternoon out)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, 6, '16:30:00', '18:00:00', 'OUT of Mr. Nishimori and Mr. Shudo', 'RECURRING'
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d ON d.full_name = 'FRANCIS REFE' AND d.is_active = TRUE
WHERE v.plate_number = 'DBP-7296' AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM tbl_fixed_vehicle_schedules fs 
      WHERE fs.vehicle_id = v.vehicle_id AND fs.day_of_week = 6 AND fs.start_time = '16:30:00' AND fs.title = 'OUT of Mr. Nishimori and Mr. Shudo' AND fs.is_active = TRUE
  );


-- 3. HONDA BRV (DAZ-7569 / JOHN NEIL VALENCIA)
-- IN: Saturday 6:00 - 6:30
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, 6, '06:00:00', '06:30:00', 'IN of Ms. L. Solas', 'RECURRING'
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d ON d.full_name = 'JOHN NEIL VALENCIA' AND d.is_active = TRUE
WHERE v.plate_number = 'DAZ-7569' AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM tbl_fixed_vehicle_schedules fs 
      WHERE fs.vehicle_id = v.vehicle_id AND fs.day_of_week = 6 AND fs.start_time = '06:00:00' AND fs.title = 'IN of Ms. L. Solas' AND fs.is_active = TRUE
  );

-- OUT: Monday to Friday 17:00 - 18:00 (consistent afternoon out)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '17:00:00', '18:00:00', 'OUT of Ms. L. Solas', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JOHN NEIL VALENCIA' AND d.is_active = TRUE
WHERE v.plate_number = 'DAZ-7569' AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM tbl_fixed_vehicle_schedules fs 
      WHERE fs.vehicle_id = v.vehicle_id AND fs.day_of_week = dow.d AND fs.start_time = '17:00:00' AND fs.title = 'OUT of Ms. L. Solas' AND fs.is_active = TRUE
  );

-- OUT: Saturday 17:30 - 19:00 (afternoon out)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, 6, '17:30:00', '19:00:00', 'OUT of Ms. L. Solas', 'RECURRING'
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d ON d.full_name = 'JOHN NEIL VALENCIA' AND d.is_active = TRUE
WHERE v.plate_number = 'DAZ-7569' AND v.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM tbl_fixed_vehicle_schedules fs 
      WHERE fs.vehicle_id = v.vehicle_id AND fs.day_of_week = 6 AND fs.start_time = '17:30:00' AND fs.title = 'OUT of Ms. L. Solas' AND fs.is_active = TRUE
  );

-- Correct Saturday OUT of Ms. L. Solas to end at 19:00:00 per workbook
UPDATE tbl_fixed_vehicle_schedules
SET end_time = '19:00:00'
WHERE vehicle_id = (SELECT vehicle_id FROM tbl_vehicles WHERE plate_number = 'DAZ-7569' LIMIT 1)
  AND day_of_week = 6
  AND start_time = '17:30:00'
  AND title = 'OUT of Ms. L. Solas';

-- Register schema version 021
INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '021',
    'Add missing OUT schedules and Saturday IN/OUT schedules consistent with workbook.',
    'Database/Migrations/021_add_missing_fixed_vehicle_schedules.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
