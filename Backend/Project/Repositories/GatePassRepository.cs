using System.Data;
using Dapper;
using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public sealed class GatePassRepository(
    IDatabaseConnectionFactory connectionFactory) : IGatePassRepository
{
    public async Task<GatePassRecord> CreateDraftAsync(
        RequesterContext requester,
        CreateGatePassRequest request,
        bool requiresSuperior,
        bool requiresPresident,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        return await connection.QuerySingleAsync<GatePassRecord>(
            new CommandDefinition(
                "SP_CreateGatePass",
                new
                {
                    p_requester_user_id = requester.UserId,
                    p_requester_employee_id = requester.EmployeeRecordId,
                    p_requester_department_id = requester.DepartmentId,
                    p_requester_position_id = requester.PositionId,
                    p_destination = request.Destination,
                    p_purpose = request.Purpose,
                    p_expected_out_at = request.ExpectedOutAt.UtcDateTime,
                    p_expected_in_at = request.ExpectedInAt?.UtcDateTime,
                    p_will_return = request.WillReturn,
                    p_vehicle_usage_code = request.VehicleUsageCode,
                    p_vehicle_id = request.VehicleId,
                    p_private_vehicle_details = request.PrivateVehicleDetails,
                    p_driver_id = request.DriverId,
                    p_requires_superior_approval = requiresSuperior,
                    p_requires_president_approval = requiresPresident,
                    p_trace_id = traceId
                },
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    public async Task<long?> FindApproverAsync(
        string approvalStepCode,
        long requesterUserId,
        long? departmentId,
        long? positionId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        return await connection.QuerySingleOrDefaultAsync<long?>(
            new CommandDefinition(
                """
                SELECT aa.approver_user_id
                FROM tbl_approval_assignments aa
                JOIN tbl_user_accounts ua
                    ON ua.user_id = aa.approver_user_id
                WHERE aa.approval_step_code = @ApprovalStepCode
                  AND aa.is_active = TRUE
                  AND ua.account_status_code = 'ACTIVE'
                  AND aa.approver_user_id <> @RequesterUserId
                  AND (aa.valid_from IS NULL OR aa.valid_from <= UTC_DATE())
                  AND (aa.valid_until IS NULL OR aa.valid_until >= UTC_DATE())
                  AND (
                      @DepartmentId IS NULL
                      OR aa.department_id = @DepartmentId
                      OR aa.department_id IS NULL
                  )
                  AND (
                      @PositionId IS NULL
                      OR aa.position_id = @PositionId
                      OR aa.position_id IS NULL
                  )
                ORDER BY
                    CASE WHEN aa.department_id = @DepartmentId THEN 0 ELSE 1 END,
                    CASE WHEN aa.position_id = @PositionId THEN 0 ELSE 1 END,
                    aa.is_alternate,
                    aa.priority,
                    aa.approval_assignment_id
                LIMIT 1;
                """,
                new
                {
                    ApprovalStepCode = approvalStepCode,
                    RequesterUserId = requesterUserId,
                    DepartmentId = departmentId,
                    PositionId = positionId
                },
                cancellationToken: cancellationToken));
    }

    public async Task CreateApprovalRouteAsync(
        long gatePassId,
        IReadOnlyList<(string StepCode, long ApproverUserId)> route,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            for (var index = 0; index < route.Count; index++)
            {
                await connection.ExecuteAsync(new CommandDefinition(
                    """
                    INSERT INTO tbl_gate_pass_approval_steps (
                        gate_pass_id,
                        sequence_no,
                        approval_step_code,
                        assigned_approver_user_id,
                        approval_status_code
                    ) VALUES (
                        @GatePassId,
                        @SequenceNo,
                        @StepCode,
                        @ApproverUserId,
                        'PENDING'
                    );
                    """,
                    new
                    {
                        GatePassId = gatePassId,
                        SequenceNo = index + 1,
                        route[index].StepCode,
                        route[index].ApproverUserId
                    },
                    transaction,
                    cancellationToken: cancellationToken));
            }

            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<GatePassRecord> SubmitAsync(
        long gatePassId,
        long actorUserId,
        string initialStatus,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        return await connection.QuerySingleAsync<GatePassRecord>(
            new CommandDefinition(
                "SP_SubmitGatePass",
                new
                {
                    p_gate_pass_id = gatePassId,
                    p_actor_user_id = actorUserId,
                    p_next_status_code = initialStatus,
                    p_trace_id = traceId
                },
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    public async Task<GatePassDetail?> GetDetailAsync(
        long gatePassId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        const string sql = """
            SELECT
                records.*,
                request_row.will_return AS WillReturn,
                request_row.vehicle_usage_code AS VehicleUsageCode,
                request_row.vehicle_id AS VehicleId,
                vehicle.vehicle_name AS VehicleName,
                vehicle.plate_number AS PlateNumber,
                request_row.driver_id AS DriverId,
                driver.full_name AS DriverName,
                request_row.qr_expires_at AS QrExpiresAt,
                request_row.version_no AS VersionNo
            FROM view_gate_pass_records records
            JOIN tbl_gate_pass_requests request_row
                ON request_row.gate_pass_id = records.gate_pass_id
            LEFT JOIN tbl_vehicles vehicle
                ON vehicle.vehicle_id = request_row.vehicle_id
            LEFT JOIN tbl_drivers driver
                ON driver.driver_id = request_row.driver_id
            WHERE records.gate_pass_id = @GatePassId;

            SELECT
                step.approval_step_id AS ApprovalStepId,
                step.gate_pass_id AS GatePassId,
                step.sequence_no AS SequenceNo,
                step.approval_step_code AS ApprovalStepCode,
                step.assigned_approver_user_id AS AssignedApproverUserId,
                approver.display_name AS ApproverName,
                step.approval_status_code AS ApprovalStatusCode,
                step.comments AS Comments,
                step.acted_at AS ActedAt,
                approval_signature.signature_file_id AS SignatureFileId
            FROM tbl_gate_pass_approval_steps step
            JOIN tbl_user_accounts approver
                ON approver.user_id = step.assigned_approver_user_id
            LEFT JOIN tbl_approval_signatures approval_signature
                ON approval_signature.approval_step_id =
                   step.approval_step_id
            WHERE step.gate_pass_id = @GatePassId
            ORDER BY step.sequence_no;

            SELECT
                scan_id AS ScanId,
                gate_pass_id AS GatePassId,
                scanned_by_user_id AS ScannedByUserId,
                scan_method_code AS ScanMethodCode,
                scan_action_code AS ScanActionCode,
                result_code AS ResultCode,
                message AS Message,
                scanned_at AS ScannedAt
            FROM tbl_gate_pass_scans
            WHERE gate_pass_id = @GatePassId
            ORDER BY scanned_at;
            """;

        using var grid = await connection.QueryMultipleAsync(
            new CommandDefinition(
                sql,
                new { GatePassId = gatePassId },
                cancellationToken: cancellationToken));

        var detail = await grid.ReadSingleOrDefaultAsync<GatePassDetail>();
        if (detail is null)
        {
            return null;
        }

        var steps = (await grid.ReadAsync<ApprovalStepRecord>()).AsList();
        var scans = (await grid.ReadAsync<GatePassScanRecord>()).AsList();

        return CopyDetail(detail, steps, scans);
    }

    public async Task<PagedResult<GatePassRecord>> GetPagedAsync(
        GatePassQuery query,
        long? requesterUserId,
        CancellationToken cancellationToken = default)
    {
        var page = Math.Max(query.Page, 1);
        var pageSize = Math.Clamp(query.PageSize, 1, 200);
        var offset = (page - 1) * pageSize;

        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        const string where = """
            WHERE (@RequesterUserId IS NULL
                   OR records.requester_user_id = @RequesterUserId)
              AND (@StatusCode IS NULL
                   OR records.gate_pass_status_code = @StatusCode)
              AND (@DepartmentId IS NULL
                   OR request_row.requester_department_id = @DepartmentId)
              AND (@FromAppliedAt IS NULL
                   OR records.applied_at >= @FromAppliedAt)
              AND (@ToAppliedAt IS NULL
                   OR records.applied_at < @ToAppliedAt)
              AND (
                  @Search IS NULL
                  OR records.gate_pass_no LIKE CONCAT('%', @Search, '%')
                  OR records.employee_id LIKE CONCAT('%', @Search, '%')
                  OR records.full_name LIKE CONCAT('%', @Search, '%')
                  OR records.destination LIKE CONCAT('%', @Search, '%')
              )
            """;

        var parameters = new
        {
            RequesterUserId = requesterUserId,
            query.StatusCode,
            query.DepartmentId,
            FromAppliedAt = query.FromAppliedAt?.UtcDateTime,
            ToAppliedAt = query.ToAppliedAt?.UtcDateTime,
            Search = string.IsNullOrWhiteSpace(query.Search)
                ? null
                : query.Search.Trim(),
            Offset = offset,
            PageSize = pageSize
        };

        using var grid = await connection.QueryMultipleAsync(
            new CommandDefinition(
                $"""
                SELECT records.*
                FROM view_gate_pass_records records
                JOIN tbl_gate_pass_requests request_row
                    ON request_row.gate_pass_id = records.gate_pass_id
                {where}
                ORDER BY COALESCE(records.applied_at, records.created_at) DESC,
                         records.gate_pass_id DESC
                LIMIT @Offset, @PageSize;

                SELECT COUNT(*)
                FROM view_gate_pass_records records
                JOIN tbl_gate_pass_requests request_row
                    ON request_row.gate_pass_id = records.gate_pass_id
                {where};
                """,
                parameters,
                cancellationToken: cancellationToken));

        var items = (await grid.ReadAsync<GatePassRecord>()).AsList();
        var total = await grid.ReadSingleAsync<long>();
        return new PagedResult<GatePassRecord>(items, total, page, pageSize);
    }

    private static GatePassDetail CopyDetail(
        GatePassDetail source,
        IReadOnlyList<ApprovalStepRecord> steps,
        IReadOnlyList<GatePassScanRecord> scans) =>
        new()
        {
            GatePassId = source.GatePassId,
            GatePassNo = source.GatePassNo,
            RequesterUserId = source.RequesterUserId,
            EmployeeId = source.EmployeeId,
            FullName = source.FullName,
            DepartmentName = source.DepartmentName,
            PositionName = source.PositionName,
            Destination = source.Destination,
            Purpose = source.Purpose,
            GatePassStatusCode = source.GatePassStatusCode,
            StatusName = source.StatusName,
            StatusGroup = source.StatusGroup,
            AppliedAt = source.AppliedAt,
            ApprovalCompletedAt = source.ApprovalCompletedAt,
            ApprovedAt = source.ApprovedAt,
            RejectedAt = source.RejectedAt,
            CancelledAt = source.CancelledAt,
            ExpiredAt = source.ExpiredAt,
            ExpectedOutAt = source.ExpectedOutAt,
            ExpectedInAt = source.ExpectedInAt,
            ActualOutAt = source.ActualOutAt,
            ActualInAt = source.ActualInAt,
            CompletedAt = source.CompletedAt,
            ApplicationOutcomeCode = source.ApplicationOutcomeCode,
            CreatedAt = source.CreatedAt,
            UpdatedAt = source.UpdatedAt,
            WillReturn = source.WillReturn,
            VehicleUsageCode = source.VehicleUsageCode,
            VehicleId = source.VehicleId,
            VehicleName = source.VehicleName,
            PlateNumber = source.PlateNumber,
            DriverId = source.DriverId,
            DriverName = source.DriverName,
            QrExpiresAt = source.QrExpiresAt,
            VersionNo = source.VersionNo,
            ApprovalSteps = steps,
            Scans = scans
        };
}
