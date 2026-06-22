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
                WHERE step.assigned_approver_user_id = @ApproverUserId
                  AND step.approval_status_code = 'PENDING'
                  AND request_row.gate_pass_status_code = CONCAT(
                      'PENDING_',
                      step.approval_step_code
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
        string traceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var current = await connection.QuerySingleOrDefaultAsync<CurrentStep>(
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
                        step.assigned_approver_user_id AS ApproverUserId
                    FROM tbl_gate_pass_requests request_row
                    JOIN tbl_gate_pass_approval_steps step
                        ON step.gate_pass_id = request_row.gate_pass_id
                       AND request_row.gate_pass_status_code = CONCAT(
                           'PENDING_',
                           step.approval_step_code
                       )
                    WHERE request_row.gate_pass_id = @GatePassId
                      AND step.approval_status_code = 'PENDING'
                    FOR UPDATE;
                    """,
                    new { GatePassId = gatePassId },
                    transaction,
                    cancellationToken: cancellationToken));

            if (current is null || current.ApproverUserId != actorUserId)
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
            var decisionCode = approve ? "APPROVED" : "REJECTED";

            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_gate_pass_approval_steps
                SET approval_status_code = @DecisionCode,
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
                    current.ApprovalStepId
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
                         AND @FormTypeCode = 'PERSON_GATE_PASS'
                            THEN @QrTokenHash
                        ELSE qr_token_hash
                    END,
                    qr_expires_at = CASE
                        WHEN @NewStatus = 'APPROVED'
                         AND @FormTypeCode = 'PERSON_GATE_PASS'
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
    }
}
