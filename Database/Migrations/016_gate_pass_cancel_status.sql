USE gate_pass_system;

-- =========================================================
-- Phase 11 / Req 1B: HRAD "Cancel Gate Pass" status support.
--
-- The CANCELLED gate-pass status and CANCELLED reservation
-- status are already defined in Database/seed-reference.sql for
-- fresh installs. This migration guarantees they also exist in
-- databases that were seeded before those rows were added, using
-- the exact same terminal flags so an upgraded DB matches a
-- freshly seeded one. Both inserts are idempotent.
-- =========================================================

-- 1. Ensure the terminal CANCELLED gate-pass status exists.
INSERT INTO tbl_gate_pass_statuses (
    gate_pass_status_code,
    status_name,
    status_group,
    is_terminal,
    allows_qr_scan,
    sort_order
) VALUES
('CANCELLED', 'Cancelled', 'TERMINAL', TRUE, FALSE, 110)
ON DUPLICATE KEY UPDATE
    status_name = VALUES(status_name),
    status_group = VALUES(status_group),
    is_terminal = VALUES(is_terminal),
    allows_qr_scan = VALUES(allows_qr_scan),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

-- 2. Ensure the terminal CANCELLED reservation status exists.
INSERT INTO tbl_reservation_statuses (
    reservation_status_code,
    status_name,
    blocks_availability,
    is_terminal,
    sort_order
) VALUES
('CANCELLED', 'Cancelled', FALSE, TRUE, 60)
ON DUPLICATE KEY UPDATE
    status_name = VALUES(status_name),
    blocks_availability = VALUES(blocks_availability),
    is_terminal = VALUES(is_terminal),
    sort_order = VALUES(sort_order),
    is_active = TRUE;

-- 3. Register schema version 016
INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '016',
    'Ensure terminal CANCELLED gate-pass and reservation statuses exist for the HRAD Cancel Gate Pass action.',
    'Database/Migrations/016_gate_pass_cancel_status.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
