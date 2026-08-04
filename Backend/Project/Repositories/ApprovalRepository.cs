using Dapper;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

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
                    request_row.will_return AS WillReturn,
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
                      OR (
                          step.approval_step_code = 'HRAD_ASSIGN'
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
                                    'fleet.manage'
                          )
                          AND EXISTS (
                              SELECT 1
                              FROM tbl_approval_assignments aa
                              WHERE aa.approver_user_id = @ApproverUserId
                                AND aa.approval_step_code = 'HRAD_ASSIGN'
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

    public async Task<ApprovalDecisionContext?> GetDecisionContextAsync(
        long gatePassId,
        long actorUserId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        return await connection.QueryFirstOrDefaultAsync<ApprovalDecisionContext>(
            new CommandDefinition(
                """
                SELECT
                    request_row.gate_pass_id AS GatePassId,
                    request_row.form_type_code AS FormTypeCode,
                    request_row.will_return AS WillReturn,
                    request_row.vehicle_usage_code AS VehicleUsageCode,
                    request_row.vehicle_trip_type_code AS VehicleTripTypeCode,
                    step.approval_step_code AS ApprovalStepCode
                FROM tbl_gate_pass_requests request_row
                JOIN tbl_gate_pass_approval_steps step
                  ON step.gate_pass_id = request_row.gate_pass_id
                 AND step.approval_status_code = 'PENDING'
                WHERE request_row.gate_pass_id = @GatePassId
                  AND request_row.requester_user_id <> @ActorUserId
                  AND (
                      request_row.gate_pass_status_code = CONCAT('PENDING_', step.approval_step_code)
                      OR (
                          request_row.gate_pass_status_code = 'ON_HOLD'
                          AND step.approval_step_code = 'HRAD_ASSIGN'
                      )
                  )
                  AND (
                      step.assigned_approver_user_id = @ActorUserId
                      OR (
                          step.approval_step_code = 'PAS'
                          AND EXISTS (
                              SELECT 1
                              FROM tbl_user_roles actor_role
                              JOIN tbl_role_permissions role_permission
                                ON role_permission.role_id = actor_role.role_id
                              JOIN tbl_permissions permission_row
                                ON permission_row.permission_id = role_permission.permission_id
                              WHERE actor_role.user_id = @ActorUserId
                                AND actor_role.is_active = TRUE
                                AND permission_row.permission_code = 'gatepass.note.pas'
                          )
                          AND EXISTS (
                              SELECT 1
                              FROM tbl_approval_assignments assignment
                              WHERE assignment.approver_user_id = @ActorUserId
                                AND assignment.approval_step_code = 'PAS'
                                AND assignment.form_type_code = request_row.form_type_code
                                AND assignment.is_active = TRUE
                          )
                      )
                      OR (
                          step.approval_step_code = 'HRAD_ASSIGN'
                          AND EXISTS (
                              SELECT 1
                              FROM tbl_user_roles actor_role
                              JOIN tbl_role_permissions role_permission
                                ON role_permission.role_id = actor_role.role_id
                              JOIN tbl_permissions permission_row
                                ON permission_row.permission_id = role_permission.permission_id
                              WHERE actor_role.user_id = @ActorUserId
                                AND actor_role.is_active = TRUE
                                AND permission_row.permission_code = 'fleet.manage'
                          )
                          AND EXISTS (
                              SELECT 1
                              FROM tbl_approval_assignments assignment
                              WHERE assignment.approver_user_id = @ActorUserId
                                AND assignment.approval_step_code = 'HRAD_ASSIGN'
                                AND assignment.form_type_code = request_row.form_type_code
                                AND assignment.is_active = TRUE
                          )
                      )
                  )
                ORDER BY step.sequence_no
                LIMIT 1;
                """,
                new { GatePassId = gatePassId, ActorUserId = actorUserId },
                cancellationToken: cancellationToken));
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
        DateTime? expectedOutAt,
        DateTime? expectedInAt,
        DateTime? secondaryExpectedOutAt,
        DateTime? secondaryExpectedInAt,
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
                        request_row.will_return AS WillReturn,
                        request_row.vehicle_usage_code AS VehicleUsageCode,
                        request_row.vehicle_trip_type_code AS VehicleTripTypeCode,
                        request_row.gate_pass_status_code AS CurrentStatus,
                        request_row.expected_out_at AS ExpectedOutAt,
                        request_row.expected_in_at AS ExpectedInAt,
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
                if (!string.Equals(
                        current.VehicleUsageCode,
                        "COMPANY",
                        StringComparison.OrdinalIgnoreCase) ||
                    !vehicleId.HasValue || vehicleId.Value <= 0)
                {
                    throw new VehicleReservationConflictException(
                        "Select the company vehicle before forwarding.");
                }

                var resolvedExpectedOutAt = expectedOutAt ?? current.ExpectedOutAt;
                var resolvedExpectedInAt = expectedInAt ?? current.ExpectedInAt;
                if (!resolvedExpectedOutAt.HasValue || !resolvedExpectedInAt.HasValue ||
                    resolvedExpectedInAt <= resolvedExpectedOutAt)
                {
                    throw new VehicleReservationConflictException(
                        "Set a valid HRAD schedule start and end before forwarding.");
                }

                var authoritativeTripType = string.IsNullOrWhiteSpace(current.VehicleTripTypeCode)
                    ? tripType?.Trim().ToUpperInvariant()
                    : current.VehicleTripTypeCode.Trim().ToUpperInvariant();
                var dropOffOnly =
                    current.FormTypeCode == "MATERIAL_GATE_PASS" || !current.WillReturn;
                var validTripType = dropOffOnly
                    ? authoritativeTripType == "HATID"
                    : authoritativeTripType is "BOTH" or "HATID" or "SUNDO";
                if (!validTripType)
                {
                    throw new VehicleReservationConflictException(
                        dropOffOnly
                            ? "This request only allows Hatid lang."
                            : "Select Hatid at Sundo, Hatid lang, or Sundo lang.");
                }

                var resolvedSecondaryExpectedOutAt = secondaryExpectedOutAt;
                var resolvedSecondaryExpectedInAt = secondaryExpectedInAt;
                var hasSecondaryWindow =
                    resolvedSecondaryExpectedOutAt.HasValue &&
                    resolvedSecondaryExpectedInAt.HasValue;

                // Phase 17 item 7: the reservation rows must keep the two
                // real legs of a split schedule (e.g. 10-11 AM and 1-2 PM) so
                // the calendar shows the gap in between as vacant. Only the
                // request row below stores the widened envelope.
                var primaryWindowOutAt = resolvedExpectedOutAt;
                var primaryWindowInAt = resolvedExpectedInAt;

                if (hasSecondaryWindow)
                {
                    if (!resolvedExpectedOutAt.HasValue ||
                        !resolvedExpectedInAt.HasValue)
                    {
                        throw new InvalidOperationException(
                            "Primary HRAD schedule window is required.");
                    }

                    if (resolvedSecondaryExpectedOutAt < resolvedExpectedOutAt)
                    {
                        resolvedExpectedOutAt = resolvedSecondaryExpectedOutAt;
                    }

                    if (resolvedSecondaryExpectedInAt > resolvedExpectedInAt)
                    {
                        resolvedExpectedInAt = resolvedSecondaryExpectedInAt;
                    }
                }

                var reservationWindows = new List<(DateTime ReservedFrom, DateTime ReservedUntil)>
                {
                    (primaryWindowOutAt.Value, primaryWindowInAt!.Value)
                };
                if (hasSecondaryWindow)
                {
                    reservationWindows.Add((
                        resolvedSecondaryExpectedOutAt!.Value,
                        resolvedSecondaryExpectedInAt!.Value));
                }

                var selectableVehicle = await connection.QuerySingleOrDefaultAsync<bool?>(
                    new CommandDefinition(
                        """
                        SELECT status_row.is_selectable
                        FROM tbl_vehicles vehicle
                        JOIN tbl_vehicle_statuses status_row
                          ON status_row.vehicle_status_code = vehicle.vehicle_status_code
                        WHERE vehicle.vehicle_id = @VehicleId
                          AND vehicle.is_active = TRUE
                        FOR UPDATE;
                        """,
                        new { VehicleId = vehicleId.Value },
                        transaction,
                        cancellationToken: cancellationToken));
                if (selectableVehicle != true)
                {
                    throw new VehicleReservationConflictException(
                        "The selected company vehicle is not available.");
                }

                foreach (var window in reservationWindows)
                {
                    var fixedConflicts = await connection.ExecuteScalarAsync<int>(
                        new CommandDefinition(
                            """
                            -- Reservations are stored in UTC while fixed schedules keep
                            -- Philippine wall-clock times, so shift +8h before comparing.
                            SELECT COUNT(*)
                            FROM tbl_fixed_vehicle_schedules schedule
                            WHERE schedule.vehicle_id = @VehicleId
                              AND schedule.is_active = TRUE
                              AND schedule.day_of_week = DAYOFWEEK(DATE_ADD(@ReservedFrom, INTERVAL 8 HOUR)) - 1
                              AND schedule.start_time < CAST(DATE_ADD(@ReservedUntil, INTERVAL 8 HOUR) AS TIME)
                              AND schedule.end_time > CAST(DATE_ADD(@ReservedFrom, INTERVAL 8 HOUR) AS TIME);
                            """,
                            new
                            {
                                VehicleId = vehicleId.Value,
                                window.ReservedFrom,
                                window.ReservedUntil
                            },
                            transaction,
                            cancellationToken: cancellationToken));

                    var activeConflicts = await connection.ExecuteScalarAsync<int>(
                        new CommandDefinition(
                            """
                            SELECT COUNT(*)
                            FROM tbl_vehicle_reservations reservation
                            JOIN tbl_reservation_statuses status_row
                              ON status_row.reservation_status_code = reservation.reservation_status_code
                            WHERE reservation.vehicle_id = @VehicleId
                              AND reservation.gate_pass_id <> @GatePassId
                              AND status_row.blocks_availability = TRUE
                              AND reservation.reserved_from < @ReservedUntil
                              AND COALESCE(
                                  reservation.reserved_until,
                                  '9999-12-31 23:59:59'
                              ) > @ReservedFrom;
                            """,
                            new
                            {
                                GatePassId = gatePassId,
                                VehicleId = vehicleId.Value,
                                window.ReservedFrom,
                                window.ReservedUntil
                            },
                            transaction,
                            cancellationToken: cancellationToken));

                    if (fixedConflicts > 0 || activeConflicts > 0)
                    {
                        throw new VehicleReservationConflictException(
                            "The selected vehicle is already booked for one of the requested schedule windows.");
                    }

                    // Phase 18.4: the driver must be free too — a driver already
                    // out on a fixed run (explicit or as a vehicle's default
                    // driver) or on another pass's reservation cannot be
                    // double-booked onto this trip.
                    if (driverId.HasValue && driverId.Value > 0)
                    {
                        var driverFixedConflicts = await connection.ExecuteScalarAsync<int>(
                            new CommandDefinition(
                                """
                                SELECT COUNT(*)
                                FROM tbl_fixed_vehicle_schedules schedule
                                JOIN tbl_vehicles vehicle
                                  ON vehicle.vehicle_id = schedule.vehicle_id
                                WHERE schedule.is_active = TRUE
                                  AND COALESCE(schedule.driver_id, vehicle.default_driver_id) = @DriverId
                                  AND schedule.day_of_week = DAYOFWEEK(DATE_ADD(@ReservedFrom, INTERVAL 8 HOUR)) - 1
                                  AND schedule.start_time < CAST(DATE_ADD(@ReservedUntil, INTERVAL 8 HOUR) AS TIME)
                                  AND schedule.end_time > CAST(DATE_ADD(@ReservedFrom, INTERVAL 8 HOUR) AS TIME);
                                """,
                                new
                                {
                                    DriverId = driverId.Value,
                                    window.ReservedFrom,
                                    window.ReservedUntil
                                },
                                transaction,
                                cancellationToken: cancellationToken));

                        var driverReservationConflicts = await connection.ExecuteScalarAsync<int>(
                            new CommandDefinition(
                                """
                                SELECT COUNT(*)
                                FROM tbl_vehicle_reservations reservation
                                JOIN tbl_reservation_statuses status_row
                                  ON status_row.reservation_status_code = reservation.reservation_status_code
                                WHERE reservation.driver_id = @DriverId
                                  AND reservation.gate_pass_id <> @GatePassId
                                  AND status_row.blocks_availability = TRUE
                                  AND reservation.reserved_from < @ReservedUntil
                                  AND COALESCE(
                                      reservation.reserved_until,
                                      '9999-12-31 23:59:59'
                                  ) > @ReservedFrom;
                                """,
                                new
                                {
                                    GatePassId = gatePassId,
                                    DriverId = driverId.Value,
                                    window.ReservedFrom,
                                    window.ReservedUntil
                                },
                                transaction,
                                cancellationToken: cancellationToken));

                        if (driverFixedConflicts > 0 || driverReservationConflicts > 0)
                        {
                            throw new VehicleReservationConflictException(
                                "The selected driver is already scheduled for one of the requested windows. Assign a different driver.");
                        }
                    }
                }

                await connection.ExecuteAsync(new CommandDefinition(
                    """
                    UPDATE tbl_gate_pass_requests
                    SET vehicle_id = @VehicleId,
                        driver_id = @DriverId,
                        expected_out_at = @ExpectedOutAt,
                        expected_in_at = @ExpectedInAt,
                        -- The requester's own Hatid/Sundo/Both choice is authoritative:
                        -- keep whatever they already submitted and only fall back to the
                        -- HRAD-supplied value for legacy requests that stored none.
                        vehicle_trip_type_code = COALESCE(
                            NULLIF(TRIM(vehicle_trip_type_code), ''),
                            NULLIF(TRIM(@TripType), '')
                        ),
                        vehicle_usage_code = CASE
                            WHEN @VehicleId IS NULL AND NULLIF(TRIM(@TripType), '') IS NOT NULL THEN 'PRIVATE'
                            WHEN @VehicleId IS NOT NULL THEN 'COMPANY'
                            ELSE vehicle_usage_code
                        END
                    WHERE gate_pass_id = @GatePassId;
                    """,
                    new
                    {
                        GatePassId = gatePassId,
                        VehicleId = vehicleId,
                        DriverId = driverId,
                        TripType = authoritativeTripType,
                        ExpectedOutAt = resolvedExpectedOutAt,
                        ExpectedInAt = resolvedExpectedInAt
                    },
                    transaction,
                    cancellationToken: cancellationToken));

                await connection.ExecuteAsync(new CommandDefinition(
                    "DELETE FROM tbl_vehicle_reservations WHERE gate_pass_id = @GatePassId;",
                    new { GatePassId = gatePassId },
                    transaction,
                    cancellationToken: cancellationToken));

                foreach (var reservationWindow in reservationWindows)
                {
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
                            @ReservedFrom,
                            @ReservedUntil,
                            'PENDING'
                        );
                        """,
                        new
                        {
                            GatePassId = gatePassId,
                            VehicleId = vehicleId.Value,
                            DriverId = driverId,
                            reservationWindow.ReservedFrom,
                            reservationWindow.ReservedUntil
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

            // Update associated vehicle reservation status.
            // The reservation stays PENDING (and shows as "pending" on the calendar)
            // through every remaining approval step — including the final PAS noting —
            // and only becomes RESERVED once the gate pass is fully APPROVED. A PENDING
            // reservation still blocks vehicle availability, so this does not risk a
            // double-booking while the request is awaiting its last sign-offs.
            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_vehicle_reservations
                SET reservation_status_code = CASE
                    WHEN @NewStatusCode = 'APPROVED' THEN 'RESERVED'
                    WHEN @NewStatusCode IN ('REJECTED', 'CANCELLED') THEN 'CANCELLED'
                    ELSE reservation_status_code
                END
                WHERE gate_pass_id = @RecordId
                  AND reservation_status_code = 'PENDING';
                """,
                new
                {
                    NewStatusCode = newStatus,
                    RecordId = gatePassId
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

    private sealed class CurrentStep
    {
        public long GatePassId { get; init; }
        public string FormTypeCode { get; init; } = "PERSON_GATE_PASS";
        public bool WillReturn { get; init; }
        public string VehicleUsageCode { get; init; } = "NONE";
        public string? VehicleTripTypeCode { get; init; }
        public string CurrentStatus { get; init; } = string.Empty;
        public DateTime? ExpectedOutAt { get; init; }
        public DateTime? ExpectedInAt { get; init; }
        public long RequesterUserId { get; init; }
        public long ApprovalStepId { get; init; }
        public int SequenceNo { get; init; }
        public string ApprovalStepCode { get; init; } = string.Empty;
        public long ApproverUserId { get; init; }
        public bool CanAct { get; init; }
    }
}

