USE gate_pass_system;

-- =========================================================
-- 1. CREATE tbl_fixed_vehicle_schedules
-- =========================================================

CREATE TABLE IF NOT EXISTS tbl_fixed_vehicle_schedules (
    fixed_schedule_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    driver_id BIGINT UNSIGNED NULL,
    day_of_week TINYINT UNSIGNED NOT NULL COMMENT '0=Sunday,1=Monday,...,6=Saturday',
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    title VARCHAR(255) NOT NULL,
    description VARCHAR(500) NULL,
    schedule_type VARCHAR(30) NOT NULL DEFAULT 'RECURRING' COMMENT 'RECURRING or BLOCK',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fixed_schedule_vehicle FOREIGN KEY (vehicle_id) REFERENCES tbl_vehicles(vehicle_id),
    CONSTRAINT fk_fixed_schedule_driver FOREIGN KEY (driver_id) REFERENCES tbl_drivers(driver_id),
    INDEX ix_fixed_schedule_day_vehicle (day_of_week, vehicle_id, is_active),
    INDEX ix_fixed_schedule_vehicle_active (vehicle_id, is_active)
) ENGINE=InnoDB;

-- =========================================================
-- 2. SEED CONSTANT WEEKLY FIXED SCHEDULES
-- =========================================================

-- ---------------------------------------------------------
-- HONDA CRV (NOV-8084 / JONATHAN TURRECHA)
-- ---------------------------------------------------------

-- IN of Mr. Maekawa 5:30-6:00 (Mon-Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '05:30:00', '06:00:00', 'IN of Mr. Maekawa', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'NOV-8084' AND v.is_active = TRUE;

-- IN of Mr. Maekawa 6:00-6:30 (Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, 6, '06:00:00', '06:30:00', 'IN of Mr. Maekawa', 'RECURRING'
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'NOV-8084' AND v.is_active = TRUE;

-- MORNING MEETING 7:30-8:00 (Mon-Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '07:30:00', '08:00:00', 'MORNING MEETING', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'NOV-8084' AND v.is_active = TRUE;

-- LUNCH BREAK 11:30-12:00 (Mon-Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '11:30:00', '12:00:00', 'LUNCH BREAK', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'NOV-8084' AND v.is_active = TRUE;

-- OUT of Mr. Maekawa 16:30-17:00 (Mon-Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '16:30:00', '17:00:00', 'OUT of Mr. Maekawa', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'NOV-8084' AND v.is_active = TRUE;

-- ---------------------------------------------------------
-- HONDA HRV (DBP-7296 / FRANCIS REFE)
-- ---------------------------------------------------------

-- IN of Mr. Nishimori and Mr. Shudo 5:30-6:00 (Mon-Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '05:30:00', '06:00:00', 'IN of Mr. Nishimori and Mr. Shudo', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'FRANCIS REFE' AND d.is_active = TRUE
WHERE v.plate_number = 'DBP-7296' AND v.is_active = TRUE;

-- IN of Mr. Nishimori and Mr. Shudo 6:00-6:30 (Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, 6, '06:00:00', '06:30:00', 'IN of Mr. Nishimori and Mr. Shudo', 'RECURRING'
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d ON d.full_name = 'FRANCIS REFE' AND d.is_active = TRUE
WHERE v.plate_number = 'DBP-7296' AND v.is_active = TRUE;

-- OUT of Mr. Nishimori and Mr. Shudo 16:30-17:00 (Mon-Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '16:30:00', '17:00:00', 'OUT of Mr. Nishimori and Mr. Shudo', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'FRANCIS REFE' AND d.is_active = TRUE
WHERE v.plate_number = 'DBP-7296' AND v.is_active = TRUE;

-- ---------------------------------------------------------
-- HONDA BRV (DAZ-7569 / JOHN NEIL VALENCIA)
-- ---------------------------------------------------------

-- IN of Ms. L. Solas 5:30-6:00 (Mon-Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '05:30:00', '06:00:00', 'IN of Ms. L. Solas', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JOHN NEIL VALENCIA' AND d.is_active = TRUE
WHERE v.plate_number = 'DAZ-7569' AND v.is_active = TRUE;

-- IN of Ms. L. Solas 6:00-6:30 (Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, 6, '06:00:00', '06:30:00', 'IN of Ms. L. Solas', 'RECURRING'
FROM tbl_vehicles v
LEFT JOIN tbl_drivers d ON d.full_name = 'JOHN NEIL VALENCIA' AND d.is_active = TRUE
WHERE v.plate_number = 'DAZ-7569' AND v.is_active = TRUE;

-- OUT of Ms. L. Solas 16:30-17:00 (Mon-Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '16:30:00', '17:00:00', 'OUT of Ms. L. Solas', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JOHN NEIL VALENCIA' AND d.is_active = TRUE
WHERE v.plate_number = 'DAZ-7569' AND v.is_active = TRUE;

-- ---------------------------------------------------------
-- TOYOTA INNOVA (WVO-408 / JONATHAN TURRECHA)
-- ---------------------------------------------------------

-- Ms. S. Lijauco (PEZA) 10:00-10:30 (Mon-Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '10:00:00', '10:30:00', 'Ms. S. Lijauco (PEZA)', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'WVO-408' AND v.is_active = TRUE;

-- Ms. S. Lijauco (PEZA & BPI) 13:00-13:30 (Mon-Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '13:00:00', '13:30:00', 'Ms. S. Lijauco (PEZA & BPI)', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'JONATHAN TURRECHA' AND d.is_active = TRUE
WHERE v.plate_number = 'WVO-408' AND v.is_active = TRUE;

-- ---------------------------------------------------------
-- ISUZU CANTER (ZJE-745 / ALEX) - TRUCK SCHEDULE
-- ---------------------------------------------------------

-- MDD Transfer 5 PALLETS 08:00-09:00 (Mon,Tue,Thu,Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '08:00:00', '09:00:00', 'MDD Transfer 5 PALLETS', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'ALEX' AND d.is_active = TRUE
WHERE v.plate_number = 'ZJE-745' AND v.is_active = TRUE;

-- MDD Transfer 5 PALLETS 09:00-10:00 (Mon,Tue,Thu,Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '09:00:00', '10:00:00', 'MDD Transfer 5 PALLETS', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'ALEX' AND d.is_active = TRUE
WHERE v.plate_number = 'ZJE-745' AND v.is_active = TRUE;

-- MDD Transfer 5 PALLETS 10:00-11:00 (Mon,Tue,Thu,Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '10:00:00', '11:00:00', 'MDD Transfer 5 PALLETS', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'ALEX' AND d.is_active = TRUE
WHERE v.plate_number = 'ZJE-745' AND v.is_active = TRUE;

-- MORNING MEETING 7:30-8:00 (Mon-Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '07:30:00', '08:00:00', 'MORNING MEETING', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'ALEX' AND d.is_active = TRUE
WHERE v.plate_number = 'ZJE-745' AND v.is_active = TRUE;

-- ---------------------------------------------------------
-- MITSUBISHI FUSO (DAV-3864 / ALVIN) - TRUCK SCHEDULE
-- ---------------------------------------------------------

-- NEP Transfer 5 PALLETS 08:00-09:00 (Tue,Wed,Thu,Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '08:00:00', '09:00:00', 'NEP Transfer 5 PALLETS', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 2 AS d UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'ALVIN' AND d.is_active = TRUE
WHERE v.plate_number = 'DAV-3864' AND v.is_active = TRUE;

-- NEP Transfer 5 PALLETS 09:00-10:00 (Tue,Wed,Thu,Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '09:00:00', '10:00:00', 'NEP Transfer 5 PALLETS', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 2 AS d UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'ALVIN' AND d.is_active = TRUE
WHERE v.plate_number = 'DAV-3864' AND v.is_active = TRUE;

-- NEP Transfer 5 PALLETS 10:00-11:00 (Tue,Wed,Thu,Fri)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '10:00:00', '11:00:00', 'NEP Transfer 5 PALLETS', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 2 AS d UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'ALVIN' AND d.is_active = TRUE
WHERE v.plate_number = 'DAV-3864' AND v.is_active = TRUE;

-- MORNING MEETING 7:30-8:00 (Mon-Sat)
INSERT INTO tbl_fixed_vehicle_schedules (vehicle_id, driver_id, day_of_week, start_time, end_time, title, schedule_type)
SELECT v.vehicle_id, d.driver_id, dow.d, '07:30:00', '08:00:00', 'MORNING MEETING', 'RECURRING'
FROM tbl_vehicles v
CROSS JOIN (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) dow
LEFT JOIN tbl_drivers d ON d.full_name = 'ALVIN' AND d.is_active = TRUE
WHERE v.plate_number = 'DAV-3864' AND v.is_active = TRUE;

-- =========================================================
-- 3. REGISTER SCHEMA VERSION
-- =========================================================

INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '012',
    'Add tbl_fixed_vehicle_schedules and seed constant weekly vehicle/truck schedules.',
    'Database/Migrations/012_vehicle_schedule_and_constants.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
