using Dapper;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public sealed class SecurityRepository(
    IDatabaseConnectionFactory connectionFactory) : ISecurityRepository
{
    public async Task<IReadOnlyList<SecurityQueueItem>> GetQueueAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        var items = await connection.QueryAsync<SecurityQueueItem>(
            new CommandDefinition(
                """
                SELECT *
                FROM view_security_gate_queue
                ORDER BY expected_out_at, gate_pass_id;
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
                        request_row.qr_expires_at AS QrExpiresAt
                    FROM tbl_gate_pass_requests request_row
                    JOIN tbl_gate_pass_statuses status_row
                        ON status_row.gate_pass_status_code =
                           request_row.gate_pass_status_code
                    WHERE (
                        @EmployeeRecordId IS NOT NULL
                        AND request_row.requester_employee_id =
                            @EmployeeRecordId
                        AND status_row.is_terminal = FALSE
                    ) OR (
                        @QrTokenHash IS NOT NULL
                        AND request_row.qr_token_hash = @QrTokenHash
                    ) OR (
                        @ManualGatePassNo IS NOT NULL
                        AND request_row.gate_pass_no = @ManualGatePassNo
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

            if (gatePass is null)
            {
                var missing = new SecurityScanResult(
                    null,
                    "NO_ACTIVE_GATE_PASS",
                    "Gate pass verification is not available.",
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
                    cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return missing;
            }

            var now = DateTime.UtcNow;
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
                    cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return expired;
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
                    actual_in_at = CASE
                        WHEN @Action = 'TIME_IN' THEN @RecordedAt
                        ELSE actual_in_at
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
                    TraceId = traceId
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

    private static Task<int> InsertScanAsync(
        System.Data.Common.DbConnection connection,
        System.Data.Common.DbTransaction transaction,
        long? gatePassId,
        long guardUserId,
        string method,
        string action,
        SecurityScanResult result,
        string identifierHash,
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
                provided_identifier_hash
            ) VALUES (
                @GatePassId,
                @GuardUserId,
                @Method,
                @Action,
                @ResultCode,
                @Message,
                @IdentifierHash
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
                IdentifierHash = identifierHash
            },
            transaction,
            cancellationToken: cancellationToken));

    private sealed class ScanTarget
    {
        public long GatePassId { get; init; }
        public string StatusCode { get; init; } = string.Empty;
        public bool WillReturn { get; init; }
        public long? VehicleId { get; init; }
        public DateTime? QrExpiresAt { get; init; }
    }
}
