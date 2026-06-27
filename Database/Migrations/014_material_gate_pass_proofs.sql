USE gate_pass_system;

CREATE TABLE IF NOT EXISTS tbl_material_gate_pass_proofs (
    proof_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    gate_pass_id BIGINT UNSIGNED NOT NULL,
    signature_file_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_material_proof_gate_pass FOREIGN KEY (gate_pass_id) REFERENCES tbl_gate_pass_requests(gate_pass_id) ON DELETE CASCADE,
    CONSTRAINT fk_material_proof_file FOREIGN KEY (signature_file_id) REFERENCES tbl_signature_files(signature_file_id)
) ENGINE=InnoDB;

-- Register schema version 014
INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '014',
    'Create tbl_material_gate_pass_proofs for photo attachments.',
    'Database/Migrations/014_material_gate_pass_proofs.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
