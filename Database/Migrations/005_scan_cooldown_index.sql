USE gate_pass_system;

ALTER TABLE tbl_gate_pass_scans
    ADD INDEX IF NOT EXISTS ix_scans_identifier_time (
        provided_identifier_hash,
        scanned_at
    );

INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '005',
    'Add the employee and gate pass scan cooldown lookup index.',
    'Database/Migrations/005_scan_cooldown_index.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
