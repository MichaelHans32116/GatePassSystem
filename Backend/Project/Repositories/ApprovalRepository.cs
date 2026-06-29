using Dapper;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public sealed class ApprovalRepository(
    IDatabaseConnectionFactory connectionFactory) : IApprovalRepository
{
    public async Task<IReadOnlyList<ApprovalQueueItem>> GetQueueAsync(
        long approverUserId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        var items = await connection.QueryAsync<ApprovalQueueItem>(
            new CommandDefinition(
                """
                SELECT
                    request_row.gate_pass_id AS GatePassId,
                    request_row.gate_pass_no AS GatePassNo,
                    request_row.control_no AS ControlNo,
                    request_row.form_type_code AS FormTypeCode,
                    form_type.form_name AS FormName,
                    step.approval_step_id AS ApprovalStepId,
                    step.approval_step_code AS ApprovalStepCode,
                    employee.employee_id AS EmployeeId,
                    employee.full_name AS FullName,
                    department.department_name AS DepartmentName,
                    request_row.destination AS Destination,
                    request_row.purpose AS Purpose,
                    authorized_employee.full_name AS AuthorizedEmployeeName,
                    authorized_department.department_name AS AuthorizedDepartmentName,
                    request_row.material_remarks AS MaterialRemarks,
                    request_row.expected_out_at AS ExpectedOutAt,
                    request_row.expected_in_at AS ExpectedInAt,
                    request_row.applied_at AS AppliedAt
                FROM tbl_gate_pass_approval_steps step
                JOIN tbl_gate_pass_requests request_row
                    ON request_row.gate_pass_id = step.gate_pass_id
                JOIN tbl_form_types form_type
                    ON form_type.form_type_code = request_row.form_type_code
                JOIN tbl_employees employee
                    ON employee.employee_record_id =
                       request_row.requester_employee_id
                JOIN tbl_departments department
                    ON department.department_id =
                       request_row.requester_department_id
                LEFT JOIN tbl_employees authorized_employee
                    ON authorized_employee.employee_record_id =
                       request_row.authorized_employee_id
                LEFT JOIN tbl_departments authorized_department
                    ON authorized_department.department_id =
                       request_row.authorized_department_id
                WHERE step.approval_status_code = 'PENDING'
                  AND request_row.requester_user_id <> @ApproverUserId
                  AND (
                      step.assigned_approver_user_id = @ApproverUserId
                      OR (
                          step.approval_step_code = 'PAS'
                          AND EXISTS (
                              SELECT 1
                              FROM tbl_user_roles actor_role
                              JOIN tbl_role_permissions role_permission
                                ON role_permission.role_id =
                                   actor_role.role_id
                              JOIN tbl_permissions permission_row
                                ON permission_row.permission_id =
                                   role_permission.permission_id
                              JOIN tbl_roles role_row
                                ON role_row.role_id = actor_role.role_id
                              WHERE actor_role.user_id = @ApproverUserId
                                AND actor_role.is_active = TRUE
                                AND role_row.is_active = TRUE
                                AND permission_row.permission_code =
                                    'gatepass.note.pas'
                          )
                          AND EXISTS (
                              SELECT 1
                              FROM tbl_approval_assignments aa
                              WHERE aa.approver_user_id = @ApproverUserId
                                AND aa.approval_step_code = 'PAS'
                                AND aa.form_type_code =
                                    request_row.form_type_code
                                AND aa.is_active = TRUE
                          )
                      )
                  )
                  AND (
                      request_row.gate_pass_status_code = CONCAT('PENDING_', step.approval_step_code)
                      OR (request_row.gate_pass_status_code = 'ON_HOLD' AND step.approval_step_code = 'HRAD_ASSIGN')
                  )
                ORDER BY request_row.applied_at, step.approval_step_id;
                """,
                new { ApproverUserId = approverUserId },
                cancellationToken: cancellationToken));

        return items.AsList();
    }

    public async Task<ApprovalMutation?> DecideAsync(
        long gatePassId,
        long actorUserId,
        bool approve,
        string? comment,
        long? signatureFileId,
        string? qrTokenHash,
        DateTime? qrExpiresAt,
        long? vehicleId,
        long? driverId,
        bool? putOnHold,
        string? tripType,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var current = await connection.QueryFirstOrDefaultAsync<CurrentStep>(
                new CommandDefinition(
                    """
                    SELECT
                        request_row.gate_pass_id AS GatePassId,
                        request_row.form_type_code AS FormTypeCode,
                        request_row.gate_pass_status_code AS CurrentStatus,
                        request_row.requester_user_id AS RequesterUserId,
                        step.approval_step_id AS ApprovalStepId,
                        step.sequence_no AS SequenceNo,
                        step.approval_step_code AS ApprovalStepCode,
                        step.assigned_approver_user_id AS ApproverUserId,
                        (
                            step.assigned_approver_user_id = @ActorUserId
                            OR (
                                step.approval_step_code = 'PAS'
                                AND EXISTS (
                                    SELECT 1
                                    FROM tbl_user_roles actor_role
                                    JOIN tbl_role_permissions role_permission
                                      ON role_permission.role_id =
                                         actor_role.role_id
                                    JOIN tbl_permissions permission_row
                                      ON permission_row.permission_id =
                                         role_permission.permission_id
                                    JOIN tbl_roles role_row
                                      ON role_row.role_id =
                                         actor_role.role_id
                                    WHERE actor_role.user_id = @ActorUserId
                                      AND actor_role.is_active = TRUE
                                      AND role_row.is_active = TRUE
                                      AND permission_row.permission_code =
                                          'gatepass.note.pas'
                                )
                                AND EXISTS (
                                    SELECT 1
                                    FROM tbl_approval_assignments aa
                                    WHERE aa.approver_user_id = @ActorUserId
                                      AND aa.approval_step_code = 'PAS'
                                      AND aa.form_type_code =
                                          request_row.form_type_code
                                      AND aa.is_active = TRUE
                                )
                            )
                        ) AS CanAct
                    FROM tbl_gate_pass_requests request_row
                    JOIN tbl_gate_pass_approval_steps step
                        ON step.gate_pass_id = request_row.gate_pass_id
                       AND (
                           request_row.gate_pass_status_code = CONCAT('PENDING_', step.approval_step_code)
                           OR (request_row.gate_pass_status_code = 'ON_HOLD' AND step.approval_status_code = 'PENDING')
                       )
                    WHERE request_row.gate_pass_id = @GatePassId
                      AND step.approval_status_code = 'PENDING'
                    ORDER BY step.sequence_no
                    LIMIT 1
                    FOR UPDATE;
                    """,
                    new
                    {
                        GatePassId = gatePassId,
                        ActorUserId = actorUserId
                    },
                    transaction,
                    cancellationToken: cancellationToken));

            if (current is null || !current.CanAct)
            {
                await transaction.RollbackAsync(cancellationToken);
                return null;
            }

            if (current.RequesterUserId == actorUserId)
            {
                throw new InvalidOperationException(
                    "A requester cannot approve their own gate pass.");
            }

            var actedAt = DateTime.UtcNow;

            // 1. Handle Put On Hold option for HR Assignment step
            if (current.ApprovalStepCode == "HRAD_ASSIGN" && putOnHold == true)
            {
                await connection.ExecuteAsync(new CommandDefinition(
                    """
                    UPDATE tbl_gate_pass_requests
                    SET gate_pass_status_code = 'ON_HOLD',
                        version_no = version_no + 1
                    WHERE gate_pass_id = @GatePassId;

                    INSERT INTO tbl_gate_pass_status_history (
                        gate_pass_id,
                        from_status_code,
                        to_status_code,
                        changed_by_user_id,
                        remarks,
                        trace_id
                    ) VALUES (
                        @GatePassId,
                        @PreviousStatus,
                        'ON_HOLD',
                        @ActorUserId,
                        @Comment,
                        @TraceId
                    );

                    -- Stamp the hold reason onto the current pending step so it
                    -- surfaces in the Decision Remarks panel. The step stays
                    -- PENDING so the resume-from-hold flow still finds it.
                    UPDATE tbl_gate_pass_approval_steps
                    SET comments = NULLIF(TRIM(@Comment), '')
                    WHERE gate_pass_id = @GatePassId
                      AND approval_step_code = @ApprovalStepCode
                      AND approval_status_code = 'PENDING';
                    """,
                    new
                    {
                        GatePassId = gatePassId,
                        PreviousStatus = current.CurrentStatus,
                        ActorUserId = actorUserId,
                        Comment = comment ?? "Put on hold by HR.",
                        ApprovalStepCode = current.ApprovalStepCode,
                        TraceId = traceId
                    },
                    transaction,
                    cancellationToken: cancellationToken));

                // Send notification to requester
                await connection.ExecuteAsync(new CommandDefinition(
                    """
                    INSERT INTO tbl_notifications (
                        user_id,
                        title,
                        message,
                        notification_type_code,
                        related_entity_type,
                        related_entity_id,
                        is_read
                    ) VALUES (
                        @UserId,
                        'Gate Pass Put on Hold',
                        @Message,
                        'SYSTEM_INFO',
                        'GATE_PASS',
                        @GatePassId,
                        0
                    );
                    """,
                    new
                    {
                        UserId = current.RequesterUserId,
                        Message = $"Your gate pass request has been put on hold by HR. Comment: {comment}",
                        GatePassId = gatePassId
                    },
                    transaction,
                    cancellationToken: cancellationToken));

                await transaction.CommitAsync(cancellationToken);
                return new ApprovalMutation(
                    gatePassId,
                    current.FormTypeCode,
                    current.CurrentStatus,
                    "ON_HOLD",
                    null);
            }

            // 2. Handle Vehicle/Driver assignment on HR approval
            if (current.ApprovalStepCode == "HRAD_ASSIGN" && approve)
            {
                await connection.ExecuteAsync(new CommandDefinition(
                    """
                    UPDATE tbl_gate_pass_requests
                    SET vehicle_id = @VehicleId,
                        driver_id = @DriverId,
                        private_vehicle_details = CASE 
                            WHEN @VehicleId IS NULL THEN @TripType 
                            ELSE NULL
                        END,
                        vehicle_usage_code = CASE
                            WHEN @VehicleId IS NULL AND @TripType IS NOT NULL THEN 'PRIVATE'
                            ELSE 'COMPANY'
                        END
                    WHERE gate_pass_id = @GatePassId;
                    """,
                    new
                    {
                        GatePassId = gatePassId,
                        VehicleId = vehicleId,
                        DriverId = driverId,
                        TripType = tripType
                    },
                    transaction,
                    cancellationToken: cancellationToken));

                if (vehicleId.HasValue && vehicleId.Value > 0)
                {
                    // Clean up any existing reservation first to avoid duplicates
                    await connection.ExecuteAsync(new CommandDefinition(
                        "DELETE FROM tbl_vehicle_reservations WHERE gate_pass_id = @GatePassId;",
                        new { GatePassId = gatePassId },
                        transaction,
                        cancellationToken: cancellationToken));

                    await connection.ExecuteAsync(new CommandDefinition(
                        """
                        INSERT INTO tbl_vehicle_reservations (
                            gate_pass_id,
                            vehicle_id,
                            driver_id,
                            reserved_from,
                            reserved_until,
                            reservation_status_code
                        ) VALUES (
                            @GatePassId,
                            @VehicleId,
                            @DriverId,
                            (SELECT expected_out_at FROM tbl_gate_pass_requests WHERE gate_pass_id = @GatePassId),
                            (SELECT expected_in_at FROM tbl_gate_pass_requests WHERE gate_pass_id = @GatePassId),
                            'PENDING'
                        );
                        """,
                        new
                        {
                            GatePassId = gatePassId,
                            VehicleId = vehicleId.Value,
                            DriverId = driverId
                        },
                        transaction,
                        cancellationToken: cancellationToken));
                }
            }

            var decisionCode = approve ? "APPROVED" : "REJECTED";
            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_gate_pass_approval_steps
                SET approval_status_code = @DecisionCode,
                    assigned_approver_user_id = CASE
                        WHEN @ApprovalStepCode = 'PAS'
                            THEN @ActorUserId
                        ELSE assigned_approver_user_id
                    END,
                    comments = NULLIF(TRIM(@Comment), ''),
                    acted_at = @ActedAt
                WHERE approval_step_id = @ApprovalStepId
                  AND approval_status_code = 'PENDING';
                """,
                new
                {
                    DecisionCode = decisionCode,
                    Comment = comment,
                    ActedAt = actedAt,
                    current.ApprovalStepId,
                    current.ApprovalStepCode,
                    ActorUserId = actorUserId
                },
                transaction,
                cancellationToken: cancellationToken));

            if (signatureFileId.HasValue)
            {
                var signatureOwned = await connection.ExecuteScalarAsync<int>(
                    new CommandDefinition(
                        """
                        SELECT COUNT(*)
                        FROM tbl_signature_files
                        WHERE signature_file_id = @SignatureFileId
                          AND owner_user_id = @ActorUserId
                          AND is_active = TRUE;
                        """,
                        new
                        {
                            SignatureFileId = signatureFileId.Value,
                            ActorUserId = actorUserId
                        },
                        transaction,
                        cancellationToken: cancellationToken));

                if (signatureOwned == 0)
                {
                    throw new InvalidOperationException(
                        "The selected signature does not belong to the approver.");
                }

                await connection.ExecuteAsync(new CommandDefinition(
                    """
                    INSERT INTO tbl_approval_signatures (
                        approval_step_id,
                        signature_file_id
                    ) VALUES (
                        @ApprovalStepId,
                        @SignatureFileId
                    );
                    """,
                    new
                    {
                        current.ApprovalStepId,
                        SignatureFileId = signatureFileId.Value
                    },
                    transaction,
                    cancellationToken: cancellationToken));
            }

            string newStatus;
            string? nextStepCode = null;

            if (!approve)
            {
                newStatus = "REJECTED";
                await connection.ExecuteAsync(new CommandDefinition(
                    """
                    UPDATE tbl_gate_pass_approval_steps
                    SET approval_status_code = 'SKIPPED',
                        comments = 'Skipped after an earlier rejection.'
                    WHERE gate_pass_id = @GatePassId
                      AND sequence_no > @SequenceNo
                      AND approval_status_code = 'PENDING';
                    """,
                    new { GatePassId = gatePassId, current.SequenceNo },
                    transaction,
                    cancellationToken: cancellationToken));
            }
            else
            {
                nextStepCode =
                    await connection.QuerySingleOrDefaultAsync<string>(
                        new CommandDefinition(
                            """
                            SELECT approval_step_code
                            FROM tbl_gate_pass_approval_steps
                            WHERE gate_pass_id = @GatePassId
                              AND sequence_no > @SequenceNo
                              AND approval_status_code = 'PENDING'
                            ORDER BY sequence_no
                            LIMIT 1;
                            """,
                            new { GatePassId = gatePassId, current.SequenceNo },
                            transaction,
                            cancellationToken: cancellationToken));

                newStatus = nextStepCode is null
                    ? "APPROVED"
                    : $"PENDING_{nextStepCode}";
            }

            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_gate_pass_requests
                SET gate_pass_status_code = @NewStatus,
                    approval_completed_at = CASE
                        WHEN @NewStatus IN ('APPROVED', 'REJECTED')
                            THEN @ActedAt
                        ELSE approval_completed_at
                    END,
                    approved_at = CASE
                        WHEN @NewStatus = 'APPROVED' THEN @ActedAt
                        ELSE approved_at
                    END,
                    rejected_at = CASE
                        WHEN @NewStatus = 'REJECTED' THEN @ActedAt
                        ELSE rejected_at
                    END,
                    qr_token_hash = CASE
                        WHEN @NewStatus = 'APPROVED'
                            THEN @QrTokenHash
                        ELSE qr_token_hash
                    END,
                    qr_expires_at = CASE
                        WHEN @NewStatus = 'APPROVED'
                            THEN @QrExpiresAt
                        ELSE qr_expires_at
                    END,
                    version_no = version_no + 1
                WHERE gate_pass_id = @GatePassId;

                INSERT INTO tbl_gate_pass_status_history (
                    gate_pass_id,
                    from_status_code,
                    to_status_code,
                    changed_by_user_id,
                    remarks,
                    trace_id
                ) VALUES (
                    @GatePassId,
                    @PreviousStatus,
                    @NewStatus,
                    @ActorUserId,
                    NULLIF(TRIM(@Comment), ''),
                    @TraceId
                );
                """,
                new
                {
                    GatePassId = gatePassId,
                    NewStatus = newStatus,
                    ActedAt = actedAt,
                    QrTokenHash = qrTokenHash,
                    QrExpiresAt = qrExpiresAt,
                    current.FormTypeCode,
                    PreviousStatus = current.CurrentStatus,
                    ActorUserId = actorUserId,
                    Comment = comment,
                    TraceId = traceId
                },
                transaction,
                cancellationToken: cancellationToken));

            await transaction.CommitAsync(cancellationToken);
            return new ApprovalMutation(
                gatePassId,
                current.FormTypeCode,
                current.CurrentStatus,
                newStatus,
                nextStepCode);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<ApprovalMutation?> CancelAsync(
        long gatePassId,
        long actorUserId,
        string remarks,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            // Lock the request row and read its current status + form type. Only
            // non-terminal passes may be cancelled (terminal statuses already
            // carry is_terminal = TRUE in tbl_gate_pass_statuses).
            var current = await connection.QueryFirstOrDefaultAsync<CancelTarget>(
                new CommandDefinition(
                    """
                    SELECT
                        request_row.gate_pass_id AS GatePassId,
                        request_row.form_type_code AS FormTypeCode,
                        request_row.gate_pass_status_code AS CurrentStatus,
                        status_row.is_terminal AS IsTerminal
                    FROM tbl_gate_pass_requests request_row
                    JOIN tbl_gate_pass_statuses status_row
                        ON status_row.gate_pass_status_code =
                           request_row.gate_pass_status_code
                    WHERE request_row.gate_pass_id = @GatePassId
                    FOR UPDATE;
                    """,
                    new { GatePassId = gatePassId },
                    transaction,
                    cancellationToken: cancellationToken));

            if (current is null || current.IsTerminal)
            {
                await transaction.RollbackAsync(cancellationToken);
                return null;
            }

            var cancelledAt = DateTime.UtcNow;

            // 1. Move the request to the terminal CANCELLED status and record
            //    the transition in the status history (remarks idiom matches
            //    DecideAsync: NULLIF(TRIM(@Remarks), '')).
            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_gate_pass_requests
                SET gate_pass_status_code = 'CANCELLED',
                    cancelled_at = @CancelledAt,
                    version_no = version_no + 1
                WHERE gate_pass_id = @GatePassId;

                INSERT INTO tbl_gate_pass_status_history (
                    gate_pass_id,
                    from_status_code,
                    to_status_code,
                    changed_by_user_id,
                    remarks,
                    trace_id
                ) VALUES (
                    @GatePassId,
                    @PreviousStatus,
                    'CANCELLED',
                    @ActorUserId,
                    NULLIF(TRIM(@Remarks), ''),
                    @TraceId
                );
                """,
                new
                {
                    GatePassId = gatePassId,
                    CancelledAt = cancelledAt,
                    PreviousStatus = current.CurrentStatus,
                    ActorUserId = actorUserId,
                    Remarks = remarks,
                    TraceId = traceId
                },
                transaction,
                cancellationToken: cancellationToken));

            // 2. Cancel any still-active vehicle reservation linked to this pass
            //    so the vehicle is freed up (terminal reservation statuses are
            //    left untouched).
            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_vehicle_reservations reservation_row
                JOIN tbl_reservation_statuses reservation_status
                    ON reservation_status.reservation_status_code =
                       reservation_row.reservation_status_code
                SET reservation_row.reservation_status_code = 'CANCELLED'
                WHERE reservation_row.gate_pass_id = @GatePassId
                  AND reservation_status.is_terminal = FALSE;
                """,
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            await transaction.CommitAsync(cancellationToken);
            return new ApprovalMutation(
                gatePassId,
                current.FormTypeCode,
                current.CurrentStatus,
                "CANCELLED",
                null);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private sealed class CancelTarget
    {
        public long GatePassId { get; init; }
        public string FormTypeCode { get; init; } = "PERSON_GATE_PASS";
        public string CurrentStatus { get; init; } = string.Empty;
        public bool IsTerminal { get; init; }
    }

    private sealed class CurrentStep
    {
        public long GatePassId { get; init; }
        public string FormTypeCode { get; init; } = "PERSON_GATE_PASS";
        public string CurrentStatus { get; init; } = string.Empty;
        public long RequesterUserId { get; init; }
        public long ApprovalStepId { get; init; }
        public int SequenceNo { get; init; }
        public string ApprovalStepCode { get; init; } = string.Empty;
        public long ApproverUserId { get; init; }
        public bool CanAct { get; init; }
    }
}
