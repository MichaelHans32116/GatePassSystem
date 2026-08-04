USE gate_pass_system;

DELIMITER $$

DROP PROCEDURE IF EXISTS SP_CreateGatePass$$
CREATE PROCEDURE SP_CreateGatePass(
    IN p_requester_user_id BIGINT UNSIGNED,
    IN p_requester_employee_id BIGINT UNSIGNED,
    IN p_requester_department_id BIGINT UNSIGNED,
    IN p_requester_position_id BIGINT UNSIGNED,
    IN p_prepared_by_signature_file_id BIGINT UNSIGNED,
    IN p_destination VARCHAR(255),
    IN p_purpose TEXT,
    IN p_expected_out_at DATETIME,
    IN p_expected_in_at DATETIME,
    IN p_will_return BOOLEAN,
    IN p_vehicle_usage_code VARCHAR(30),
    IN p_vehicle_trip_type_code VARCHAR(20),
    IN p_vehicle_id BIGINT UNSIGNED,
    IN p_private_vehicle_details VARCHAR(255),
    IN p_driver_id BIGINT UNSIGNED,
    IN p_requires_superior_approval BOOLEAN,
    IN p_requires_president_approval BOOLEAN,
    IN p_trace_id VARCHAR(100)
)
BEGIN
    DECLARE v_gate_pass_id BIGINT UNSIGNED;
    DECLARE v_gate_pass_no VARCHAR(50);
    DECLARE v_temporary_no VARCHAR(50);
    DECLARE v_control_no VARCHAR(20);
    DECLARE v_control_sequence INT UNSIGNED;
    DECLARE v_form_date DATE;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_will_return = TRUE AND p_expected_in_at IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Expected Time In is required when the associate will return.';
    END IF;

    IF p_expected_in_at IS NOT NULL AND p_expected_in_at <= p_expected_out_at THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Expected Time In must be later than Expected Time Out.';
    END IF;

    START TRANSACTION;

    SET v_form_date = DATE(p_expected_out_at);

    INSERT INTO tbl_form_control_sequences (
        control_date,
        last_sequence
    ) VALUES (
        v_form_date,
        1
    )
    ON DUPLICATE KEY UPDATE
        last_sequence = last_sequence + 1;

    SELECT last_sequence
    INTO v_control_sequence
    FROM tbl_form_control_sequences
    WHERE control_date = v_form_date
    FOR UPDATE;

    SET v_control_no = CONCAT(
        DATE_FORMAT(v_form_date, '%m%d%y'),
        '-',
        LPAD(v_control_sequence, 3, '0')
    );

    SET v_temporary_no = CONCAT('TMP-', UUID());

    INSERT INTO tbl_gate_pass_requests (
        gate_pass_no,
        form_type_code,
        control_no,
        form_date,
        requester_user_id,
        requester_employee_id,
        requester_department_id,
        requester_position_id,
        prepared_by_signature_file_id,
        destination,
        purpose,
        expected_out_at,
        expected_in_at,
        will_return,
        vehicle_usage_code,
        vehicle_trip_type_code,
        vehicle_id,
        private_vehicle_details,
        driver_id,
        gate_pass_status_code,
        requires_superior_approval,
        requires_president_approval
    ) VALUES (
        v_temporary_no,
        'PERSON_GATE_PASS',
        v_control_no,
        v_form_date,
        p_requester_user_id,
        p_requester_employee_id,
        p_requester_department_id,
        p_requester_position_id,
        p_prepared_by_signature_file_id,
        TRIM(p_destination),
        TRIM(p_purpose),
        p_expected_out_at,
        p_expected_in_at,
        p_will_return,
        p_vehicle_usage_code,
        NULLIF(TRIM(p_vehicle_trip_type_code), ''),
        p_vehicle_id,
        NULLIF(TRIM(p_private_vehicle_details), ''),
        p_driver_id,
        'DRAFT',
        p_requires_superior_approval,
        p_requires_president_approval
    );

    SET v_gate_pass_id = LAST_INSERT_ID();
    SET v_gate_pass_no = CONCAT(
        'GP-',
        DATE_FORMAT(v_form_date, '%Y%m%d'),
        '-',
        LPAD(v_control_sequence, 6, '0')
    );

    UPDATE tbl_gate_pass_requests
    SET gate_pass_no = v_gate_pass_no
    WHERE gate_pass_id = v_gate_pass_id;

    INSERT INTO tbl_gate_pass_status_history (
        gate_pass_id,
        from_status_code,
        to_status_code,
        changed_by_user_id,
        remarks,
        trace_id
    ) VALUES (
        v_gate_pass_id,
        NULL,
        'DRAFT',
        p_requester_user_id,
        'Gate pass draft created.',
        p_trace_id
    );

    COMMIT;

    SELECT
        gate_pass_id,
        gate_pass_no,
        gate_pass_status_code,
        created_at
    FROM tbl_gate_pass_requests
    WHERE gate_pass_id = v_gate_pass_id;
END$$

DROP PROCEDURE IF EXISTS SP_CreateMaterialGatePass$$
CREATE PROCEDURE SP_CreateMaterialGatePass(
    IN p_requester_user_id BIGINT UNSIGNED,
    IN p_requester_employee_id BIGINT UNSIGNED,
    IN p_requester_department_id BIGINT UNSIGNED,
    IN p_requester_position_id BIGINT UNSIGNED,
    IN p_prepared_by_signature_file_id BIGINT UNSIGNED,
    IN p_authorized_employee_id BIGINT UNSIGNED,
    IN p_authorized_department_id BIGINT UNSIGNED,
    IN p_form_date DATE,
    IN p_material_remarks VARCHAR(1000),
    IN p_vehicle_usage_code VARCHAR(30),
    IN p_private_vehicle_details VARCHAR(255),
    IN p_items_json LONGTEXT,
    IN p_trace_id VARCHAR(100)
)
BEGIN
    DECLARE v_gate_pass_id BIGINT UNSIGNED;
    DECLARE v_gate_pass_no VARCHAR(50);
    DECLARE v_temporary_no VARCHAR(50);
    DECLARE v_control_no VARCHAR(20);
    DECLARE v_control_sequence INT UNSIGNED;
    DECLARE v_item_count INT DEFAULT 0;
    DECLARE v_item_index INT DEFAULT 0;
    DECLARE v_item_no VARCHAR(80);
    DECLARE v_description VARCHAR(500);
    DECLARE v_quantity DECIMAL(12, 3);
    DECLARE v_unit VARCHAR(50);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_form_date IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Material gate pass date is required.';
    END IF;

    IF p_authorized_employee_id IS NULL
       OR p_authorized_department_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'The authorized employee is required.';
    END IF;

    -- Phase 11 / Requirement 5: the primary authorized employee remains the
    -- single authorized_employee_id below (mirrored as line_no=1 in
    -- tbl_gate_pass_associates). Additional companions (line_no>=2) are
    -- inserted by GatePassRepository within the same create flow.

    IF p_items_json IS NULL OR JSON_VALID(p_items_json) = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A valid material item list is required.';
    END IF;

    SET v_item_count = JSON_LENGTH(p_items_json);
    IF v_item_count < 1 OR v_item_count > 20 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Material gate pass must contain 1 to 20 items.';
    END IF;

    START TRANSACTION;

    INSERT INTO tbl_form_control_sequences (
        control_date,
        last_sequence
    ) VALUES (
        p_form_date,
        1
    )
    ON DUPLICATE KEY UPDATE
        last_sequence = last_sequence + 1;

    SELECT last_sequence
    INTO v_control_sequence
    FROM tbl_form_control_sequences
    WHERE control_date = p_form_date
    FOR UPDATE;

    SET v_control_no = CONCAT(
        DATE_FORMAT(p_form_date, '%m%d%y'),
        '-',
        LPAD(v_control_sequence, 3, '0')
    );
    SET v_temporary_no = CONCAT('TMP-', UUID());

    INSERT INTO tbl_gate_pass_requests (
        gate_pass_no,
        form_type_code,
        control_no,
        form_date,
        requester_user_id,
        requester_employee_id,
        requester_department_id,
        requester_position_id,
        prepared_by_signature_file_id,
        authorized_employee_id,
        authorized_department_id,
        destination,
        purpose,
        material_remarks,
        expected_out_at,
        expected_in_at,
        will_return,
        vehicle_usage_code,
        private_vehicle_details,
        gate_pass_status_code,
        requires_superior_approval,
        requires_president_approval
    ) VALUES (
        v_temporary_no,
        'MATERIAL_GATE_PASS',
        v_control_no,
        p_form_date,
        p_requester_user_id,
        p_requester_employee_id,
        p_requester_department_id,
        p_requester_position_id,
        p_prepared_by_signature_file_id,
        p_authorized_employee_id,
        p_authorized_department_id,
        'MATERIAL RELEASE',
        'Material gate pass request',
        NULLIF(TRIM(p_material_remarks), ''),
        TIMESTAMP(p_form_date, '00:00:00'),
        NULL,
        FALSE,
        COALESCE(NULLIF(TRIM(p_vehicle_usage_code), ''), 'NONE'),
        NULLIF(TRIM(p_private_vehicle_details), ''),
        'DRAFT',
        TRUE,
        FALSE
    );

    SET v_gate_pass_id = LAST_INSERT_ID();
    SET v_gate_pass_no = CONCAT(
        'GP-',
        DATE_FORMAT(p_form_date, '%Y%m%d'),
        '-',
        LPAD(v_control_sequence, 6, '0')
    );

    UPDATE tbl_gate_pass_requests
    SET gate_pass_no = v_gate_pass_no
    WHERE gate_pass_id = v_gate_pass_id;

    WHILE v_item_index < v_item_count DO
        SET v_item_no = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(
            p_items_json,
            CONCAT('$[', v_item_index, '].itemNo')
        ))), '');
        SET v_description = TRIM(JSON_UNQUOTE(JSON_EXTRACT(
            p_items_json,
            CONCAT('$[', v_item_index, '].description')
        )));
        SET v_quantity = CAST(JSON_UNQUOTE(JSON_EXTRACT(
            p_items_json,
            CONCAT('$[', v_item_index, '].quantity')
        )) AS DECIMAL(12, 3));
        SET v_unit = TRIM(JSON_UNQUOTE(JSON_EXTRACT(
            p_items_json,
            CONCAT('$[', v_item_index, '].unit')
        )));

        IF v_description IS NULL OR v_description = ''
           OR v_quantity IS NULL OR v_quantity <= 0
           OR v_unit IS NULL OR v_unit = '' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Every material item needs a description, positive quantity, and unit.';
        END IF;

        INSERT INTO tbl_material_gate_pass_items (
            gate_pass_id,
            line_no,
            item_no,
            description,
            quantity,
            unit
        ) VALUES (
            v_gate_pass_id,
            v_item_index + 1,
            v_item_no,
            v_description,
            v_quantity,
            v_unit
        );

        SET v_item_index = v_item_index + 1;
    END WHILE;

    INSERT INTO tbl_gate_pass_status_history (
        gate_pass_id,
        from_status_code,
        to_status_code,
        changed_by_user_id,
        remarks,
        trace_id
    ) VALUES (
        v_gate_pass_id,
        NULL,
        'DRAFT',
        p_requester_user_id,
        'Material gate pass draft created.',
        p_trace_id
    );

    COMMIT;

    SELECT *
    FROM view_gate_pass_records
    WHERE gate_pass_id = v_gate_pass_id;
END$$

DROP PROCEDURE IF EXISTS SP_SubmitGatePass$$
CREATE PROCEDURE SP_SubmitGatePass(
    IN p_gate_pass_id BIGINT UNSIGNED,
    IN p_actor_user_id BIGINT UNSIGNED,
    IN p_next_status_code VARCHAR(40),
    IN p_trace_id VARCHAR(100)
)
BEGIN
    DECLARE v_current_status VARCHAR(40) DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_next_status_code NOT IN (
        'PENDING_SUPERIOR',
        'PENDING_HRAD_ASSIGN',
        'PENDING_PRESIDENT',
        'PENDING_PAS'
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid initial approval status.';
    END IF;

    START TRANSACTION;

    SELECT gate_pass_status_code
    INTO v_current_status
    FROM tbl_gate_pass_requests
    WHERE gate_pass_id = p_gate_pass_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Gate pass request was not found.';
    END IF;

    IF v_current_status <> 'DRAFT' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Only a draft gate pass can be submitted.';
    END IF;

    UPDATE tbl_gate_pass_requests
    SET gate_pass_status_code = p_next_status_code,
        applied_at = COALESCE(applied_at, UTC_TIMESTAMP()),
        version_no = version_no + 1
    WHERE gate_pass_id = p_gate_pass_id;

    INSERT INTO tbl_gate_pass_status_history (
        gate_pass_id,
        from_status_code,
        to_status_code,
        changed_by_user_id,
        remarks,
        trace_id
    ) VALUES (
        p_gate_pass_id,
        v_current_status,
        p_next_status_code,
        p_actor_user_id,
        'Form request submitted.',
        p_trace_id
    );

    COMMIT;

    SELECT *
    FROM view_gate_pass_records
    WHERE gate_pass_id = p_gate_pass_id;
END$$

DROP PROCEDURE IF EXISTS SP_ResolveGatePassApplication$$
CREATE PROCEDURE SP_ResolveGatePassApplication(
    IN p_gate_pass_id BIGINT UNSIGNED,
    IN p_actor_user_id BIGINT UNSIGNED,
    IN p_outcome_code VARCHAR(40),
    IN p_remarks VARCHAR(500),
    IN p_trace_id VARCHAR(100)
)
BEGIN
    DECLARE v_current_status VARCHAR(40) DEFAULT NULL;
    DECLARE v_resolved_at DATETIME;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_outcome_code NOT IN ('APPROVED', 'REJECTED') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Application outcome must be APPROVED or REJECTED.';
    END IF;

    START TRANSACTION;

    SELECT gate_pass_status_code
    INTO v_current_status
    FROM tbl_gate_pass_requests
    WHERE gate_pass_id = p_gate_pass_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Gate pass request was not found.';
    END IF;

    IF v_current_status NOT IN (
        'PENDING_SUPERIOR',
        'PENDING_HRAD_ASSIGN',
        'PENDING_PRESIDENT',
        'PENDING_PAS'
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Gate pass application is not awaiting a decision.';
    END IF;

    SET v_resolved_at = UTC_TIMESTAMP();

    UPDATE tbl_gate_pass_requests
    SET gate_pass_status_code = p_outcome_code,
        approval_completed_at = v_resolved_at,
        approved_at = CASE
            WHEN p_outcome_code = 'APPROVED' THEN v_resolved_at
            ELSE approved_at
        END,
        rejected_at = CASE
            WHEN p_outcome_code = 'REJECTED' THEN v_resolved_at
            ELSE rejected_at
        END,
        version_no = version_no + 1
    WHERE gate_pass_id = p_gate_pass_id;

    INSERT INTO tbl_gate_pass_status_history (
        gate_pass_id,
        from_status_code,
        to_status_code,
        changed_by_user_id,
        remarks,
        trace_id
    ) VALUES (
        p_gate_pass_id,
        v_current_status,
        p_outcome_code,
        p_actor_user_id,
        NULLIF(TRIM(p_remarks), ''),
        p_trace_id
    );

    COMMIT;

    SELECT *
    FROM view_gate_pass_records
    WHERE gate_pass_id = p_gate_pass_id;
END$$

DROP PROCEDURE IF EXISTS SP_CompleteGatePassTransaction$$
CREATE PROCEDURE SP_CompleteGatePassTransaction(
    IN p_gate_pass_id BIGINT UNSIGNED,
    IN p_actor_user_id BIGINT UNSIGNED,
    IN p_completion_status_code VARCHAR(40),
    IN p_trace_id VARCHAR(100)
)
BEGIN
    DECLARE v_current_status VARCHAR(40) DEFAULT NULL;
    DECLARE v_completed_at DATETIME;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_completion_status_code NOT IN ('RETURNED', 'CLOSED') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Completion status must be RETURNED or CLOSED.';
    END IF;

    START TRANSACTION;

    SELECT gate_pass_status_code
    INTO v_current_status
    FROM tbl_gate_pass_requests
    WHERE gate_pass_id = p_gate_pass_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Gate pass request was not found.';
    END IF;

    IF (
        p_completion_status_code = 'RETURNED'
        AND v_current_status NOT IN ('OUTSIDE', 'OVERDUE')
    ) OR (
        p_completion_status_code = 'CLOSED'
        AND v_current_status NOT IN ('APPROVED', 'OUTSIDE')
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Gate pass is not in a completable state.';
    END IF;

    SET v_completed_at = UTC_TIMESTAMP();

    UPDATE tbl_gate_pass_requests
    SET gate_pass_status_code = p_completion_status_code,
        completed_at = v_completed_at,
        actual_in_at = CASE
            WHEN p_completion_status_code = 'RETURNED'
                THEN COALESCE(actual_in_at, v_completed_at)
            ELSE actual_in_at
        END,
        version_no = version_no + 1
    WHERE gate_pass_id = p_gate_pass_id;

    INSERT INTO tbl_gate_pass_status_history (
        gate_pass_id,
        from_status_code,
        to_status_code,
        changed_by_user_id,
        remarks,
        trace_id
    ) VALUES (
        p_gate_pass_id,
        v_current_status,
        p_completion_status_code,
        p_actor_user_id,
        'Gate pass transaction completed.',
        p_trace_id
    );

    COMMIT;

    SELECT *
    FROM view_gate_pass_records
    WHERE gate_pass_id = p_gate_pass_id;
END$$

DROP PROCEDURE IF EXISTS SP_GetGatePassRecordsPaged$$
CREATE PROCEDURE SP_GetGatePassRecordsPaged(
    IN p_status_code VARCHAR(40),
    IN p_department_id BIGINT UNSIGNED,
    IN p_from_applied_at DATETIME,
    IN p_to_applied_at DATETIME,
    IN p_search VARCHAR(180),
    IN p_page_number INT,
    IN p_page_size INT
)
BEGIN
    DECLARE v_page_number INT DEFAULT GREATEST(COALESCE(p_page_number, 1), 1);
    DECLARE v_page_size INT DEFAULT LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 200);
    DECLARE v_offset INT DEFAULT (v_page_number - 1) * v_page_size;

    SELECT records.*
    FROM view_gate_pass_records records
    JOIN tbl_gate_pass_requests request_row
        ON request_row.gate_pass_id = records.gate_pass_id
    WHERE (p_status_code IS NULL
           OR records.gate_pass_status_code = p_status_code)
      AND (p_department_id IS NULL
           OR request_row.requester_department_id = p_department_id)
      AND (p_from_applied_at IS NULL
           OR records.applied_at >= p_from_applied_at)
      AND (p_to_applied_at IS NULL
           OR records.applied_at < p_to_applied_at)
      AND (
          p_search IS NULL
          OR records.gate_pass_no LIKE CONCAT('%', p_search, '%')
          OR records.employee_id LIKE CONCAT('%', p_search, '%')
          OR records.full_name LIKE CONCAT('%', p_search, '%')
          OR records.destination LIKE CONCAT('%', p_search, '%')
      )
    ORDER BY COALESCE(records.applied_at, records.created_at) DESC,
             records.gate_pass_id DESC
    LIMIT v_offset, v_page_size;

    SELECT COUNT(*) AS total_count
    FROM view_gate_pass_records records
    JOIN tbl_gate_pass_requests request_row
        ON request_row.gate_pass_id = records.gate_pass_id
    WHERE (p_status_code IS NULL
           OR records.gate_pass_status_code = p_status_code)
      AND (p_department_id IS NULL
           OR request_row.requester_department_id = p_department_id)
      AND (p_from_applied_at IS NULL
           OR records.applied_at >= p_from_applied_at)
      AND (p_to_applied_at IS NULL
           OR records.applied_at < p_to_applied_at)
      AND (
          p_search IS NULL
          OR records.gate_pass_no LIKE CONCAT('%', p_search, '%')
          OR records.employee_id LIKE CONCAT('%', p_search, '%')
          OR records.full_name LIKE CONCAT('%', p_search, '%')
          OR records.destination LIKE CONCAT('%', p_search, '%')
      );
END$$

DROP PROCEDURE IF EXISTS SP_GetGatePassDashboardSnapshot$$
CREATE PROCEDURE SP_GetGatePassDashboardSnapshot(
    IN p_from_applied_at DATETIME,
    IN p_to_applied_at DATETIME,
    IN p_department_id BIGINT UNSIGNED
)
BEGIN
    DROP TEMPORARY TABLE IF EXISTS tmp_gate_pass_snapshot;

    CREATE TEMPORARY TABLE tmp_gate_pass_snapshot (
        gate_pass_id BIGINT UNSIGNED PRIMARY KEY,
        gate_pass_status_code VARCHAR(40) NOT NULL,
        applied_at DATETIME NULL,
        approval_completed_at DATETIME NULL,
        completed_at DATETIME NULL
    ) ENGINE=MEMORY;

    INSERT INTO tmp_gate_pass_snapshot (
        gate_pass_id,
        gate_pass_status_code,
        applied_at,
        approval_completed_at,
        completed_at
    )
    SELECT
        gate_pass_id,
        gate_pass_status_code,
        applied_at,
        approval_completed_at,
        completed_at
    FROM tbl_gate_pass_requests
    WHERE (p_from_applied_at IS NULL OR applied_at >= p_from_applied_at)
      AND (p_to_applied_at IS NULL OR applied_at < p_to_applied_at)
      AND (p_department_id IS NULL
           OR requester_department_id = p_department_id);

    SELECT
        COUNT(*) AS total_applications,
        SUM(gate_pass_status_code LIKE 'PENDING_%') AS pending_applications,
        SUM(gate_pass_status_code = 'APPROVED') AS approved_applications,
        SUM(gate_pass_status_code = 'REJECTED') AS rejected_applications,
        SUM(gate_pass_status_code IN ('OUTSIDE', 'OVERDUE')) AS currently_outside,
        SUM(gate_pass_status_code IN ('RETURNED', 'CLOSED')) AS completed_transactions
    FROM tmp_gate_pass_snapshot;

    SELECT
        gate_pass_status_code,
        COUNT(*) AS record_count
    FROM tmp_gate_pass_snapshot
    GROUP BY gate_pass_status_code
    ORDER BY record_count DESC, gate_pass_status_code;

    DROP TEMPORARY TABLE IF EXISTS tmp_gate_pass_snapshot;
END$$

DELIMITER ;

INSERT INTO tbl_schema_versions (
    version_no, description, script_name
) VALUES (
    '003-procedures',
    'Add transactional gate pass lifecycle and reporting stored procedures.',
    'Database/procedures.sql'
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    script_name = VALUES(script_name);
