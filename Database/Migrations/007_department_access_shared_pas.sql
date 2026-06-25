USE gate_pass_system;

INSERT INTO tbl_departments (
    department_code,
    department_name,
    description,
    is_active
) VALUES
('FINANCE_DEPARTMENT', 'FINANCE DEPARTMENT', 'Finance and accounting employees.', TRUE),
('HR_DEPARTMENT', 'HR DEPARTMENT', 'Human Resources employees.', TRUE),
('IT_DEPARTMENT', 'IT DEPARTMENT', 'Information Technology employees.', TRUE)
ON DUPLICATE KEY UPDATE
    department_name = VALUES(department_name),
    description = VALUES(description),
    is_active = TRUE;

ALTER TABLE tbl_employees
    MODIFY COLUMN department_id BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS tbl_user_department_assignments (
    user_id BIGINT UNSIGNED NOT NULL,
    department_id BIGINT UNSIGNED NOT NULL,
    can_manage BOOLEAN NOT NULL DEFAULT FALSE,
    can_request BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, department_id),
    CONSTRAINT fk_user_department_assignment_user
        FOREIGN KEY (user_id) REFERENCES tbl_user_accounts(user_id),
    CONSTRAINT fk_user_department_assignment_department
        FOREIGN KEY (department_id) REFERENCES tbl_departments(department_id),
    INDEX ix_user_department_request
        (user_id, can_request, is_active),
    INDEX ix_user_department_manage
        (department_id, can_manage, is_active)
) ENGINE=InnoDB;

-- Split the legacy combined department using the actual position names in the
-- employee export. Luz remains intentionally without a home department.
INSERT INTO tbl_positions (
    department_id,
    position_name,
    hierarchy_level,
    is_management,
    is_active
)
SELECT DISTINCT
    target_department.department_id,
    source_position.position_name,
    source_position.hierarchy_level,
    source_position.is_management,
    TRUE
FROM tbl_employees employee
JOIN tbl_positions source_position
    ON source_position.position_id = employee.position_id
JOIN tbl_departments source_department
    ON source_department.department_id = employee.department_id
JOIN tbl_departments target_department
    ON target_department.department_code = CASE
        WHEN employee.employee_id = 'GA150'
            THEN 'FINANCE_DEPARTMENT'
        WHEN UPPER(source_position.position_name) LIKE '%IT %'
          OR UPPER(source_position.position_name) LIKE '%I.T%'
          OR UPPER(source_position.position_name) LIKE '%SOFTWARE%'
            THEN 'IT_DEPARTMENT'
        WHEN UPPER(source_position.position_name) LIKE '%HR%'
          OR UPPER(source_position.position_name) LIKE '%NURSE%'
            THEN 'HR_DEPARTMENT'
        ELSE 'FINANCE_DEPARTMENT'
    END
WHERE source_department.department_code IN (
    'FINANCE_IT_DEPARTMENT',
    'FINANCE_HR_IT_DEPARTMENT'
)
ON DUPLICATE KEY UPDATE
    hierarchy_level = VALUES(hierarchy_level),
    is_management = VALUES(is_management),
    is_active = TRUE;

UPDATE tbl_employees employee
JOIN tbl_positions source_position
    ON source_position.position_id = employee.position_id
JOIN tbl_departments source_department
    ON source_department.department_id = employee.department_id
JOIN tbl_departments target_department
    ON target_department.department_code = CASE
        WHEN employee.employee_id = 'GA150'
            THEN 'FINANCE_DEPARTMENT'
        WHEN UPPER(source_position.position_name) LIKE '%IT %'
          OR UPPER(source_position.position_name) LIKE '%I.T%'
          OR UPPER(source_position.position_name) LIKE '%SOFTWARE%'
            THEN 'IT_DEPARTMENT'
        WHEN UPPER(source_position.position_name) LIKE '%HR%'
          OR UPPER(source_position.position_name) LIKE '%NURSE%'
            THEN 'HR_DEPARTMENT'
        ELSE 'FINANCE_DEPARTMENT'
    END
JOIN tbl_positions target_position
    ON target_position.department_id = target_department.department_id
   AND target_position.position_name = source_position.position_name
SET employee.department_id = CASE
        WHEN employee.employee_id = 'GA150' THEN NULL
        ELSE target_department.department_id
    END,
    employee.position_id = target_position.position_id
WHERE source_department.department_code IN (
    'FINANCE_IT_DEPARTMENT',
    'FINANCE_HR_IT_DEPARTMENT'
);

INSERT INTO tbl_user_department_assignments (
    user_id,
    department_id,
    can_manage,
    can_request,
    is_active
)
SELECT
    user_account.user_id,
    department.department_id,
    TRUE,
    TRUE,
    TRUE
FROM tbl_user_accounts user_account
JOIN tbl_employees employee
    ON employee.employee_record_id = user_account.employee_record_id
JOIN tbl_departments department
    ON department.department_code IN (
        'FINANCE_DEPARTMENT',
        'HR_DEPARTMENT',
        'IT_DEPARTMENT'
    )
WHERE employee.employee_id = 'GA150'
ON DUPLICATE KEY UPDATE
    can_manage = TRUE,
    can_request = TRUE,
    is_active = TRUE;

DELETE assignment_row
FROM tbl_approval_assignments assignment_row
JOIN tbl_user_accounts user_account
    ON user_account.user_id = assignment_row.approver_user_id
JOIN tbl_employees employee
    ON employee.employee_record_id = user_account.employee_record_id
WHERE assignment_row.approval_step_code = 'SUPERIOR'
  AND employee.employee_id = 'GA150';

INSERT INTO tbl_approval_assignments (
    approval_step_code,
    form_type_code,
    approver_user_id,
    department_id,
    position_id,
    priority,
    is_alternate,
    is_active
)
SELECT
    'SUPERIOR',
    NULL,
    user_account.user_id,
    department.department_id,
    NULL,
    1,
    FALSE,
    TRUE
FROM tbl_user_accounts user_account
JOIN tbl_employees employee
    ON employee.employee_record_id = user_account.employee_record_id
JOIN tbl_departments department
    ON department.department_code IN (
        'FINANCE_DEPARTMENT',
        'HR_DEPARTMENT',
        'IT_DEPARTMENT'
    )
WHERE employee.employee_id = 'GA150';

UPDATE tbl_departments legacy_department
SET legacy_department.is_active = FALSE
WHERE legacy_department.department_code IN (
    'FINANCE_IT_DEPARTMENT',
    'FINANCE_HR_IT_DEPARTMENT'
)
  AND NOT EXISTS (
      SELECT 1
      FROM tbl_employees employee
      WHERE employee.department_id = legacy_department.department_id
  );

INSERT INTO tbl_schema_versions (
    version_no,
    description,
    script_name
) VALUES (
    '007',
    'Split Finance, HR, and IT; add manager department access; enable shared PAS workflow.',
    'Database/Migrations/007_department_access_shared_pas.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
