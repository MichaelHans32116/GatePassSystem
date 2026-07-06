using Dapper;
using FormRequestSystem.Project.DTOs.GatePass;
using FormRequestSystem.Project.DTOs.Security;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

public sealed class SecurityRepository(
    IDatabaseConnectionFactory connectionFactory,
    TimeProvider timeProvider) : ISecurityRepository
{
    private const int ScanCooldownSeconds = 30;

    public async Task<IReadOnlyList<SecurityQueueItem>> GetQueueAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        var items = await connection.QueryAsync<SecurityQueueItem>(
            new CommandDefinition(
                """
                -- Query the base tables directly so the live queue stays correct
                -- even if a deployed security view lags behind the codebase.
                SELECT
                    gpr.gate_pass_id AS GatePassId,
                    gpr.gate_pass_no AS GatePassNo,
                    gpr.control_no AS ControlNo,
                    gpr.gate_pass_status_code AS GatePassStatusCode,
                    gps.status_name AS StatusName,
                    gpr.will_return AS WillReturn,
                    gpr.expected_out_at AS ExpectedOutAt,
                    gpr.expected_in_at AS ExpectedInAt,
                    gpr.actual_out_at AS ActualOutAt,
                    gpr.actual_in_at AS ActualInAt,
                    e.employee_record_id AS EmployeeRecordId,
                    e.employee_id AS EmployeeId,
                    e.full_name AS FullName,
                    d.department_name AS DepartmentName,
                    v.vehicle_name AS VehicleName,
                    v.plate_number AS PlateNumber,
                    dr.full_name AS DriverName
                FROM tbl_gate_pass_requests gpr
                JOIN tbl_gate_pass_statuses gps
                    ON gps.gate_pass_status_code = gpr.gate_pass_status_code
                   AND gps.allows_qr_scan = TRUE
                   AND gps.is_terminal = FALSE
                JOIN tbl_employees e
                    ON e.employee_record_id = COALESCE(gpr.authorized_employee_id, gpr.requester_employee_id)
                JOIN tbl_departments d
                    ON d.department_id = COALESCE(gpr.authorized_department_id, gpr.requester_department_id)
                LEFT JOIN tbl_vehicles v
                    ON v.vehicle_id = gpr.vehicle_id
                LEFT JOIN tbl_drivers dr
                    ON dr.driver_id = gpr.driver_id
                WHERE gpr.gate_pass_status_code IN ('APPROVED', 'OUTSIDE', 'OVERDUE')
                ORDER BY gpr.expected_out_at, gpr.gate_pass_id;
                """,
                cancellationToken: cancellationToken));
        return items.AsList();
    }

    public async Task<SecurityScanResult> ScanAsync(
        long guardUserId,
        string? qrTokenHash,
        long? employeeRecordId,
        string? manualGatePassNo,
        string providedIdentifierHash,
        string traceId,
        long? signatureFileId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var gatePass = await connection.QuerySingleOrDefaultAsync<ScanTarget>(
                new CommandDefinition(
                    """
                    SELECT
                        request_row.gate_pass_id AS GatePassId,
                        request_row.gate_pass_status_code AS StatusCode,
                        request_row.will_return AS WillReturn,
                        request_row.vehicle_id AS VehicleId,
                        request_row.qr_expires_at AS QrExpiresAt,
                        (
                            SELECT COUNT(*)
                            FROM tbl_gate_pass_approval_steps approval
                            WHERE approval.gate_pass_id =
                                request_row.gate_pass_id
                              AND approval.approval_status_code = 'PENDING'
                        ) AS PendingApprovalCount
                    FROM tbl_gate_pass_requests request_row
                    JOIN tbl_gate_pass_statuses status_row
                        ON status_row.gate_pass_status_code =
                           request_row.gate_pass_status_code
                    WHERE status_row.allows_qr_scan = TRUE
                      AND (
                        (
                            @EmployeeRecordId IS NOT NULL
                            AND (
                                request_row.requester_employee_id = @EmployeeRecordId
                                OR request_row.authorized_employee_id = @EmployeeRecordId
                            )
                            AND status_row.is_terminal = FALSE
                        ) OR (
                            @QrTokenHash IS NOT NULL
                            AND request_row.qr_token_hash = @QrTokenHash
                        ) OR (
                            @ManualGatePassNo IS NOT NULL
                            AND (
                                request_row.gate_pass_no = @ManualGatePassNo
                                OR request_row.control_no = @ManualGatePassNo
                            )
                        )
                    )
                    ORDER BY
                        CASE
                            WHEN request_row.gate_pass_status_code IN (
                                'APPROVED',
                                'OUTSIDE',
                                'OVERDUE'
                            ) THEN 0
                            ELSE 1
                        END,
                        request_row.expected_out_at,
                        request_row.gate_pass_id
                    LIMIT 1
                    FOR UPDATE;
                    """,
                    new
                    {
                        QrTokenHash = qrTokenHash,
                        EmployeeRecordId = employeeRecordId,
                        ManualGatePassNo = manualGatePassNo
                    },
                    transaction,
                    cancellationToken: cancellationToken));

            var now = timeProvider.GetUtcNow().UtcDateTime;
            var cooldownFrom = now.AddSeconds(-ScanCooldownSeconds);
            var lastIdentifierScanAt =
                await connection.QuerySingleOrDefaultAsync<DateTime?>(
                    new CommandDefinition(
                        """
                        SELECT MAX(scanned_at)
                        FROM tbl_gate_pass_scans
                        WHERE provided_identifier_hash = @IdentifierHash
                          AND scanned_at >= @CooldownFrom;
                        """,
                        new
                        {
                            IdentifierHash = providedIdentifierHash,
                            CooldownFrom = cooldownFrom
                        },
                        transaction,
                        cancellationToken: cancellationToken));
            if (lastIdentifierScanAt.HasValue)
            {
                var remaining = Math.Max(
                    1,
                    ScanCooldownSeconds -
                    (int)Math.Floor((now - lastIdentifierScanAt.Value).TotalSeconds));
                await transaction.CommitAsync(cancellationToken);
                return new SecurityScanResult(
                    null,
                    "SCAN_COOLDOWN",
                    $"Please wait {remaining} second{(remaining == 1 ? "" : "s")} before scanning this employee again.",
                    null,
                    null,
                    remaining);
            }

            if (gatePass is null)
            {
                var missing = new SecurityScanResult(
                    null,
                    "NO_ACTIVE_GATE_PASS_IGNORED",
                    "No active gate pass queue for this employee. Scan ignored.",
                    null,
                    null);
                await InsertScanAsync(
                    connection,
                    transaction,
                    null,
                    guardUserId,
                    manualGatePassNo is null ? "QR" : "MANUAL_GATE_PASS",
                    "REJECTED_ATTEMPT",
                    missing,
                    providedIdentifierHash,
                    now,
                    cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return missing;
            }

            if (qrTokenHash is not null &&
                gatePass.QrExpiresAt.HasValue &&
                gatePass.QrExpiresAt.Value < now)
            {
                var expired = new SecurityScanResult(
                    gatePass.GatePassId,
                    "QR_EXPIRED",
                    "The QR code has expired.",
                    gatePass.StatusCode,
                    null);
                await InsertScanAsync(
                    connection,
                    transaction,
                    gatePass.GatePassId,
                    guardUserId,
                    "QR",
                    "REJECTED_ATTEMPT",
                    expired,
                    providedIdentifierHash,
                    now,
                    cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return expired;
            }

            if (gatePass.PendingApprovalCount > 0)
            {
                var incomplete = new SecurityScanResult(
                    gatePass.GatePassId,
                    "REQUIREMENTS_INCOMPLETE",
                    "Gate pass requirements and approvals are incomplete.",
                    gatePass.StatusCode,
                    null);
                await InsertScanAsync(
                    connection,
                    transaction,
                    gatePass.GatePassId,
                    guardUserId,
                    manualGatePassNo is null ? "QR" : "MANUAL_GATE_PASS",
                    "REJECTED_ATTEMPT",
                    incomplete,
                    providedIdentifierHash,
                    now,
                    cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return incomplete;
            }

            string action;
            string newStatus;
            string resultCode;
            string message;

            if (gatePass.StatusCode == "APPROVED")
            {
                action = "TIME_OUT";
                newStatus = gatePass.WillReturn ? "OUTSIDE" : "CLOSED";
                resultCode = "TIME_OUT_RECORDED";
                message = "Time Out recorded successfully.";
            }
            else if (gatePass.StatusCode is "OUTSIDE" or "OVERDUE")
            {
                action = "TIME_IN";
                newStatus = "RETURNED";
                resultCode = "TIME_IN_RECORDED";
                message = "Time In recorded successfully.";
            }
            else
            {
                var isPendingApproval =
                    gatePass.StatusCode.StartsWith(
                        "PENDING_",
                        StringComparison.Ordinal);
                var invalid = new SecurityScanResult(
                    gatePass.GatePassId,
                    isPendingApproval
                        ? "REQUIREMENTS_INCOMPLETE"
                        : "INVALID_STATE",
                    isPendingApproval
                        ? "Gate pass requirements and approvals are incomplete."
                        : "This gate pass is not available for scanning.",
                    gatePass.StatusCode,
                    null);
                await InsertScanAsync(
                    connection,
                    transaction,
                    gatePass.GatePassId,
                    guardUserId,
                    manualGatePassNo is null ? "QR" : "MANUAL_GATE_PASS",
                    "REJECTED_ATTEMPT",
                    invalid,
                    providedIdentifierHash,
                    now,
                    cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return invalid;
            }

            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_gate_pass_requests
                SET gate_pass_status_code = @NewStatus,
                    actual_out_at = CASE
                        WHEN @Action = 'TIME_OUT' THEN @RecordedAt
                        ELSE actual_out_at
                    END,
                    actual_out_signature_file_id = CASE
                        WHEN @Action = 'TIME_OUT' THEN @SignatureFileId
                        ELSE actual_out_signature_file_id
                    END,
                    actual_in_at = CASE
                        WHEN @Action = 'TIME_IN' THEN @RecordedAt
                        ELSE actual_in_at
                    END,
                    actual_in_signature_file_id = CASE
                        WHEN @Action = 'TIME_IN' THEN @SignatureFileId
                        ELSE actual_in_signature_file_id
                    END,
                    completed_at = CASE
                        WHEN @NewStatus IN ('RETURNED', 'CLOSED')
                            THEN @RecordedAt
                        ELSE completed_at
                    END,
                    version_no = version_no + 1
                WHERE gate_pass_id = @GatePassId;

                UPDATE tbl_vehicle_reservations
                SET reservation_status_code = CASE
                        WHEN @Action = 'TIME_OUT' THEN 'IN_USE'
                        ELSE 'RETURNED'
                    END,
                    actual_out_at = CASE
                        WHEN @Action = 'TIME_OUT' THEN @RecordedAt
                        ELSE actual_out_at
                    END,
                    actual_in_at = CASE
                        WHEN @Action = 'TIME_IN' THEN @RecordedAt
                        ELSE actual_in_at
                    END
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
                    @GuardUserId,
                    @Message,
                    @TraceId
                );
                """,
                new
                {
                    NewStatus = newStatus,
                    Action = action,
                    RecordedAt = now,
                    gatePass.GatePassId,
                    PreviousStatus = gatePass.StatusCode,
                    GuardUserId = guardUserId,
                    Message = message,
                    TraceId = traceId,
                    SignatureFileId = signatureFileId
                },
                transaction,
                cancellationToken: cancellationToken));

            var success = new SecurityScanResult(
                gatePass.GatePassId,
                resultCode,
                message,
                newStatus,
                new DateTimeOffset(now, TimeSpan.Zero));

            await InsertScanAsync(
                connection,
                transaction,
                gatePass.GatePassId,
                guardUserId,
                manualGatePassNo is null ? "QR" : "MANUAL_GATE_PASS",
                action,
                success,
                providedIdentifierHash,
                now,
                cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return success;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<EmployeePassesResult> GetEmployeePassesAsync(
        long employeeRecordId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        var employeeName =
            await connection.QuerySingleOrDefaultAsync<string>(
                new CommandDefinition(
                    """
                    SELECT full_name
                    FROM tbl_employees
                    WHERE employee_record_id = @EmployeeRecordId;
                    """,
                    new { EmployeeRecordId = employeeRecordId },
                    cancellationToken: cancellationToken))
            ?? "Unknown Employee";

        var active = await connection.QueryAsync<EmployeePassItem>(
            new CommandDefinition(
                """
                SELECT
                    CAST(r.gate_pass_id AS SIGNED) AS GatePassId,
                    r.gate_pass_no      AS GatePassNo,
                    r.control_no        AS ControlNo,
                    ft.form_name        AS FormTypeName,
                    r.destination       AS Destination,
                    s.status_name       AS StatusName,
                    s.status_group      AS StatusGroup,
                    r.created_at        AS DateFiled,
                    r.expected_out_at   AS ExpectedOut,
                    r.completed_at      AS CompletedAt,
                    r.will_return       AS WillReturn
                FROM tbl_gate_pass_requests r
                JOIN tbl_gate_pass_statuses s
                    ON s.gate_pass_status_code = r.gate_pass_status_code
                JOIN tbl_form_types ft
                    ON ft.form_type_code = r.form_type_code
                WHERE s.is_terminal = FALSE
                  AND (
                      r.requester_employee_id = @EmployeeRecordId
                      OR r.authorized_employee_id = @EmployeeRecordId
                  )
                ORDER BY r.expected_out_at, r.gate_pass_id;
                """,
                new { EmployeeRecordId = employeeRecordId },
                cancellationToken: cancellationToken));

        var recent = await connection.QueryAsync<EmployeePassItem>(
            new CommandDefinition(
                """
                SELECT
                    CAST(r.gate_pass_id AS SIGNED) AS GatePassId,
                    r.gate_pass_no      AS GatePassNo,
                    r.control_no        AS ControlNo,
                    ft.form_name        AS FormTypeName,
                    r.destination       AS Destination,
                    s.status_name       AS StatusName,
                    s.status_group      AS StatusGroup,
                    r.created_at        AS DateFiled,
                    r.expected_out_at   AS ExpectedOut,
                    r.completed_at      AS CompletedAt,
                    r.will_return       AS WillReturn
                FROM tbl_gate_pass_requests r
                JOIN tbl_gate_pass_statuses s
                    ON s.gate_pass_status_code = r.gate_pass_status_code
                JOIN tbl_form_types ft
                    ON ft.form_type_code = r.form_type_code
                WHERE s.is_terminal = TRUE
                  AND (
                      r.requester_employee_id = @EmployeeRecordId
                      OR r.authorized_employee_id = @EmployeeRecordId
                  )
                ORDER BY r.completed_at DESC
                LIMIT 20;
                """,
                new { EmployeeRecordId = employeeRecordId },
                cancellationToken: cancellationToken));

        return new EmployeePassesResult(
            employeeName,
            active.AsList(),
            recent.AsList());
    }

    private static Task<int> InsertScanAsync(
        System.Data.Common.DbConnection connection,
        System.Data.Common.DbTransaction transaction,
        long? gatePassId,
        long guardUserId,
        string method,
        string action,
        SecurityScanResult result,
        string identifierHash,
        DateTime scannedAt,
        CancellationToken cancellationToken) =>
        connection.ExecuteAsync(new CommandDefinition(
            """
            INSERT INTO tbl_gate_pass_scans (
                gate_pass_id,
                scanned_by_user_id,
                scan_method_code,
                scan_action_code,
                result_code,
                message,
                provided_identifier_hash,
                scanned_at
            ) VALUES (
                @GatePassId,
                @GuardUserId,
                @Method,
                @Action,
                @ResultCode,
                @Message,
                @IdentifierHash,
                @ScannedAt
            );
            """,
            new
            {
                GatePassId = gatePassId,
                GuardUserId = guardUserId,
                Method = method,
                Action = action,
                result.ResultCode,
                result.Message,
                IdentifierHash = identifierHash,
                ScannedAt = scannedAt
            },
            transaction,
            cancellationToken: cancellationToken));

    public async Task<long?> GetEmployeeRecordIdByEmployeeIdAsync(
        string employeeId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<long?>(
            new CommandDefinition(
                """
                SELECT employee_record_id
                FROM tbl_employees
                WHERE employee_id = @EmployeeId
                  AND employment_status_code = 'Active';
                """,
                new { EmployeeId = employeeId },
                cancellationToken: cancellationToken));
    }

    public async Task<long?> LookupGatePassIdAsync(
        string identifier,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<long?>(
            new CommandDefinition(
                """
                SELECT gate_pass_id
                FROM tbl_gate_pass_requests
                WHERE gate_pass_no = @Identifier
                   OR control_no = @Identifier
                LIMIT 1;
                """,
                new { Identifier = identifier },
                cancellationToken: cancellationToken));
    }

    private sealed class ScanTarget
    {
        public long GatePassId { get; init; }
        public string StatusCode { get; init; } = string.Empty;
        public bool WillReturn { get; init; }
        public long? VehicleId { get; init; }
        public DateTime? QrExpiresAt { get; init; }
        public int PendingApprovalCount { get; init; }
    }
}


