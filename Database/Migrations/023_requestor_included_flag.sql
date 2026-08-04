
USE gate_pass_system;

-- =========================================================
-- Phase 17 items 1-2 / Requestor-included flag.
--
-- A person gate pass can now be filed for other people only
-- (visitors, OJTs, or co-employees) while the requestor stays
-- inside. The flag defaults to TRUE so every existing row and
-- every older client keeps the original "requestor is aboard"
-- meaning. The printable form uses it to switch between the
-- default layout and the "Requestor + Name of Associates"
-- split layout.
--
-- Non-employee companions need no schema change here:
-- tbl_gate_pass_associates.employee_id is already nullable and
-- full_name is stored per row (see migration 015).
-- =========================================================

ALTER TABLE tbl_gate_pass_requests
    ADD COLUMN IF NOT EXISTS is_requestor_included BOOLEAN NOT NULL DEFAULT TRUE
    AFTER will_return;

-- Register schema version 023
INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '023',
    'Add is_requestor_included flag to gate pass requests for others-only passes.',
    'Database/Migrations/023_requestor_included_flag.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
