using System.Data;
using System.Text.Json;
using Dapper;
using FormRequestSystem.Project.DTOs.Common;
using FormRequestSystem.Project.DTOs.GatePass;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

public sealed class GatePassRepository(
    IDatabaseConnectionFactory connectionFactory) : IGatePassRepository
{
    public async Task<GatePassRecord> CreateDraftAsync(
        RequesterContext requester,
        CreateGatePassRequest request,
        bool requiresSuperior,
        bool requiresPresident,
        IReadOnlyList<AssociateRecord> associates,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        var record = await connection.QuerySingleAsync<GatePassRecord>(
            new CommandDefinition(
                "SP_CreateGatePass",
                new
                {
                    p_requester_user_id = requester.UserId,
                    p_requester_employee_id = requester.EmployeeRecordId,
                    p_requester_department_id = requester.DepartmentId!.Value,
                    p_requester_position_id = requester.PositionId,
                    p_prepared_by_signature_file_id =
                        request.PreparedBySignatureFileId,
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

        await InsertAssociatesAsync(
            connection,
            null,
            record.GatePassId,
            associates,
            cancellationToken);

        return record;
    }

    public async Task<GatePassRecord> CreateMaterialDraftAsync(
        RequesterContext requester,
        EmployeeLookupRecord authorizedEmployee,
        CreateMaterialGatePassRequest request,
        IReadOnlyList<AssociateRecord> associates,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            var record = await connection.QuerySingleAsync<GatePassRecord>(
                new CommandDefinition(
                    "SP_CreateMaterialGatePass",
                    new
                    {
                        p_requester_user_id = requester.UserId,
                        p_requester_employee_id = requester.EmployeeRecordId,
                        p_requester_department_id = requester.DepartmentId!.Value,
                        p_requester_position_id = requester.PositionId,
                        p_prepared_by_signature_file_id =
                            request.PreparedBySignatureFileId,
                        p_authorized_employee_id =
                            authorizedEmployee.EmployeeRecordId,
                        p_authorized_department_id =
                            authorizedEmployee.DepartmentId!.Value,
                        p_form_date = request.FormDate.ToDateTime(TimeOnly.MinValue),
                        p_material_remarks = request.Remarks,
                        p_vehicle_usage_code = request.VehicleUsageCode,
                        p_private_vehicle_details = request.PrivateVehicleDetails,
                        p_items_json = JsonSerializer.Serialize(
                            request.Items,
                            new JsonSerializerOptions
                            {
                                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                            }),
                        p_trace_id = traceId
                    },
                    commandType: CommandType.StoredProcedure,
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            if (request.ProofFileIds != null && request.ProofFileIds.Count > 0)
            {
                foreach (var fileId in request.ProofFileIds)
                {
                    await connection.ExecuteAsync(new CommandDefinition(
                        """
                        INSERT INTO tbl_material_gate_pass_proofs (gate_pass_id, signature_file_id)
                        VALUES (@GatePassId, @SignatureFileId);
                        """,
                        new { GatePassId = record.GatePassId, SignatureFileId = fileId },
                        transaction,
                        cancellationToken: cancellationToken));
                }
            }

            await InsertAssociatesAsync(
                connection,
                transaction,
                record.GatePassId,
                associates,
                cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return record;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<long?> FindApproverAsync(
        string approvalStepCode,
        string formTypeCode,
        bool requireExactFormType,
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
                LEFT JOIN (
                    SELECT
                        assigned_approver_user_id,
                        COUNT(*) AS pending_count
                    FROM tbl_gate_pass_approval_steps
                    WHERE approval_status_code = 'PENDING'
                    GROUP BY assigned_approver_user_id
                ) workload
                    ON workload.assigned_approver_user_id =
                       aa.approver_user_id
                WHERE aa.approval_step_code = @ApprovalStepCode
                  AND aa.is_active = TRUE
                  AND ua.account_status_code = 'ACTIVE'
                  AND aa.approver_user_id <> @RequesterUserId
                  AND (
                      (
                          @RequireExactFormType = TRUE
                          AND aa.form_type_code = @FormTypeCode
                      )
                      OR (
                          @RequireExactFormType = FALSE
                          AND (
                              aa.form_type_code IS NULL
                              OR aa.form_type_code = @FormTypeCode
                          )
                      )
                  )
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
                    COALESCE(workload.pending_count, 0),
                    aa.approval_assignment_id
                LIMIT 1;
                """,
                new
                {
                    ApprovalStepCode = approvalStepCode,
                    FormTypeCode = formTypeCode,
                    RequireExactFormType = requireExactFormType,
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
                request_row.requester_employee_id AS RequesterEmployeeId,
                request_row.will_return AS WillReturn,
                request_row.vehicle_usage_code AS VehicleUsageCode,
                request_row.private_vehicle_details AS PrivateVehicleDetails,
                request_row.vehicle_id AS VehicleId,
                vehicle.vehicle_name AS VehicleName,
                vehicle.plate_number AS PlateNumber,
                request_row.driver_id AS DriverId,
                driver.full_name AS DriverName,
                request_row.qr_expires_at AS QrExpiresAt,
                request_row.version_no AS VersionNo,
                prep_sig.width_percent AS PreparedBySignatureWidth,
                prep_sig.y_offset AS PreparedBySignatureYOffset,
                out_sig.width_percent AS ActualOutSignatureWidth,
                out_sig.y_offset AS ActualOutSignatureYOffset,
                in_sig.width_percent AS ActualInSignatureWidth,
                in_sig.y_offset AS ActualInSignatureYOffset
            FROM view_gate_pass_records records
            JOIN tbl_gate_pass_requests request_row
                ON request_row.gate_pass_id = records.gate_pass_id
            LEFT JOIN tbl_vehicles vehicle
                ON vehicle.vehicle_id = request_row.vehicle_id
            LEFT JOIN tbl_drivers driver
                ON driver.driver_id = request_row.driver_id
            LEFT JOIN tbl_signature_files prep_sig
                ON prep_sig.signature_file_id = request_row.prepared_by_signature_file_id
            LEFT JOIN tbl_signature_files out_sig
                ON out_sig.signature_file_id = request_row.actual_out_signature_file_id
            LEFT JOIN tbl_signature_files in_sig
                ON in_sig.signature_file_id = request_row.actual_in_signature_file_id
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
                approval_signature.signature_file_id AS SignatureFileId,
                signature_file.width_percent AS SignatureWidthPercent,
                signature_file.y_offset AS SignatureYOffset
            FROM tbl_gate_pass_approval_steps step
            JOIN tbl_user_accounts approver
                ON approver.user_id = step.assigned_approver_user_id
            LEFT JOIN tbl_approval_signatures approval_signature
                ON approval_signature.approval_step_id =
                   step.approval_step_id
            LEFT JOIN tbl_signature_files signature_file
                ON signature_file.signature_file_id =
                   approval_signature.signature_file_id
            WHERE step.gate_pass_id = @GatePassId
            ORDER BY step.sequence_no;

            SELECT
                scan.scan_id AS ScanId,
                scan.gate_pass_id AS GatePassId,
                scan.scanned_by_user_id AS ScannedByUserId,
                guard.display_name AS GuardName,
                scan.scan_method_code AS ScanMethodCode,
                scan.scan_action_code AS ScanActionCode,
                scan.result_code AS ResultCode,
                scan.message AS Message,
                scan.scanned_at AS ScannedAt
            FROM tbl_gate_pass_scans scan
            LEFT JOIN tbl_user_accounts guard
                ON guard.user_id = scan.scanned_by_user_id
            WHERE scan.gate_pass_id = @GatePassId
            ORDER BY scan.scanned_at;

            SELECT
                material_item_id AS MaterialItemId,
                gate_pass_id AS GatePassId,
                line_no AS LineNo,
                item_no AS ItemNo,
                description AS Description,
                quantity AS Quantity,
                unit AS Unit
            FROM tbl_material_gate_pass_items
            WHERE gate_pass_id = @GatePassId
            ORDER BY line_no;

            SELECT
                signature_file_id
            FROM tbl_material_gate_pass_proofs
            WHERE gate_pass_id = @GatePassId;

            SELECT
                associate.associate_id AS AssociateId,
                associate.gate_pass_id AS GatePassId,
                associate.line_no AS LineNo,
                associate.employee_id AS EmployeeId,
                employee.employee_id AS EmployeeNo,
                associate.full_name AS Name,
                associate.department_id AS DepartmentId,
                department.department_name AS DepartmentName
            FROM tbl_gate_pass_associates associate
            LEFT JOIN tbl_employees employee
                ON employee.employee_record_id = associate.employee_id
            LEFT JOIN tbl_departments department
                ON department.department_id = associate.department_id
            WHERE associate.gate_pass_id = @GatePassId
            ORDER BY associate.line_no;
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
        var materialItems =
            (await grid.ReadAsync<MaterialGatePassItemRecord>()).AsList();
        var proofFileIds = (await grid.ReadAsync<long>()).AsList();
        var associates = (await grid.ReadAsync<AssociateRecord>()).AsList();

        return CopyDetail(
            detail, steps, scans, materialItems, proofFileIds, associates);
    }

    public async Task EnsureQrTokenAsync(
        long gatePassId,
        string qrTokenHash,
        DateTime qrExpiresAt,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        await connection.ExecuteAsync(
            new CommandDefinition(
                """
                UPDATE tbl_gate_pass_requests
                SET qr_token_hash = COALESCE(qr_token_hash, @QrTokenHash),
                    qr_expires_at = CASE
                        WHEN qr_expires_at IS NULL OR qr_expires_at < UTC_TIMESTAMP()
                            THEN @QrExpiresAt
                        ELSE qr_expires_at
                    END
                WHERE gate_pass_id = @GatePassId
                  AND approved_at IS NOT NULL
                  AND gate_pass_status_code NOT IN (
                      'REJECTED',
                      'CANCELLED',
                      'EXPIRED',
                      'DRAFT'
                  );
                """,
                new
                {
                    GatePassId = gatePassId,
                    QrTokenHash = qrTokenHash,
                    QrExpiresAt = qrExpiresAt
                },
                cancellationToken: cancellationToken));
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
              AND (@FormTypeCode IS NULL
                   OR records.form_type_code = @FormTypeCode)
              AND (@DepartmentId IS NULL
                   OR request_row.requester_department_id = @DepartmentId)
              AND (@FromAppliedAt IS NULL
                   OR records.applied_at >= @FromAppliedAt)
              AND (@ToAppliedAt IS NULL
                   OR records.applied_at < @ToAppliedAt)
              AND (
                  @Search IS NULL
                  OR records.gate_pass_no LIKE CONCAT('%', @Search, '%')
                  OR records.control_no LIKE CONCAT('%', @Search, '%')
                  OR records.employee_id LIKE CONCAT('%', @Search, '%')
                  OR records.full_name LIKE CONCAT('%', @Search, '%')
                  OR records.authorized_employee_no LIKE CONCAT('%', @Search, '%')
                  OR records.authorized_employee_name LIKE CONCAT('%', @Search, '%')
                  OR records.destination LIKE CONCAT('%', @Search, '%')
              )
            """;

        var parameters = new
        {
            RequesterUserId = requesterUserId,
            query.StatusCode,
            query.FormTypeCode,
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

    public async Task<bool> DeleteForTestingAsync(
        long gatePassId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var exists = await connection.ExecuteScalarAsync<int>(
                new CommandDefinition(
                    """
                    SELECT COUNT(*)
                    FROM tbl_gate_pass_requests
                    WHERE gate_pass_id = @GatePassId;
                    """,
                    new { GatePassId = gatePassId },
                    transaction,
                    cancellationToken: cancellationToken));

            if (exists == 0)
            {
                await transaction.RollbackAsync(cancellationToken);
                return false;
            }

            var signatureFileIds = (await connection.QueryAsync<long>(
                new CommandDefinition(
                    """
                    SELECT approval_signature.signature_file_id
                    FROM tbl_approval_signatures approval_signature
                    JOIN tbl_gate_pass_approval_steps approval_step
                        ON approval_step.approval_step_id =
                           approval_signature.approval_step_id
                    WHERE approval_step.gate_pass_id = @GatePassId
                    UNION
                    SELECT prepared_by_signature_file_id
                    FROM tbl_gate_pass_requests
                    WHERE gate_pass_id = @GatePassId
                      AND prepared_by_signature_file_id IS NOT NULL;
                    """,
                    new { GatePassId = gatePassId },
                    transaction,
                    cancellationToken: cancellationToken))).AsList();

            await connection.ExecuteAsync(new CommandDefinition(
                """
                DELETE approval_signature
                FROM tbl_approval_signatures approval_signature
                JOIN tbl_gate_pass_approval_steps approval_step
                    ON approval_step.approval_step_id =
                       approval_signature.approval_step_id
                WHERE approval_step.gate_pass_id = @GatePassId;
                """,
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(
                "DELETE FROM tbl_material_gate_pass_items WHERE gate_pass_id = @GatePassId;",
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(
                "DELETE FROM tbl_gate_pass_scans WHERE gate_pass_id = @GatePassId;",
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(
                "DELETE FROM tbl_gate_pass_status_history WHERE gate_pass_id = @GatePassId;",
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(
                "DELETE FROM tbl_vehicle_reservations WHERE gate_pass_id = @GatePassId;",
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(
                "DELETE FROM tbl_gate_pass_approval_steps WHERE gate_pass_id = @GatePassId;",
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(
                """
                DELETE FROM tbl_notifications
                WHERE related_entity_type = 'GATE_PASS'
                  AND related_entity_id = @GatePassId;
                """,
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(
                """
                DELETE FROM tbl_audit_logs
                WHERE entity_type IN ('GATE_PASS', 'FORM_REQUEST')
                  AND entity_id = @GatePassId;
                """,
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(
                "DELETE FROM tbl_gate_pass_requests WHERE gate_pass_id = @GatePassId;",
                new { GatePassId = gatePassId },
                transaction,
                cancellationToken: cancellationToken));

            if (signatureFileIds.Count > 0)
            {
                await connection.ExecuteAsync(new CommandDefinition(
                    """
                    DELETE FROM tbl_signature_files
                    WHERE signature_file_id IN @SignatureFileIds
                      AND NOT EXISTS (
                          SELECT 1
                          FROM tbl_gate_pass_requests r
                          WHERE r.prepared_by_signature_file_id =
                                tbl_signature_files.signature_file_id
                      )
                      AND NOT EXISTS (
                          SELECT 1
                          FROM tbl_approval_signatures a
                          WHERE a.signature_file_id =
                                tbl_signature_files.signature_file_id
                      );
                    """,
                    new { SignatureFileIds = signatureFileIds.Distinct().ToArray() },
                    transaction,
                    cancellationToken: cancellationToken));
            }

            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task InsertAssociatesAsync(
        System.Data.Common.DbConnection connection,
        System.Data.Common.DbTransaction? transaction,
        long gatePassId,
        IReadOnlyList<AssociateRecord> associates,
        CancellationToken cancellationToken)
    {
        if (associates is null || associates.Count == 0)
        {
            return;
        }

        foreach (var associate in associates)
        {
            await connection.ExecuteAsync(new CommandDefinition(
                """
                INSERT INTO tbl_gate_pass_associates (
                    gate_pass_id,
                    line_no,
                    employee_id,
                    department_id,
                    full_name
                ) VALUES (
                    @GatePassId,
                    @LineNo,
                    @EmployeeId,
                    @DepartmentId,
                    @FullName
                );
                """,
                new
                {
                    GatePassId = gatePassId,
                    associate.LineNo,
                    associate.EmployeeId,
                    associate.DepartmentId,
                    FullName = associate.Name
                },
                transaction,
                cancellationToken: cancellationToken));
        }
    }

    private static GatePassDetail CopyDetail(
        GatePassDetail source,
        IReadOnlyList<ApprovalStepRecord> steps,
        IReadOnlyList<GatePassScanRecord> scans,
        IReadOnlyList<MaterialGatePassItemRecord> materialItems,
        IReadOnlyList<long> proofFileIds,
        IReadOnlyList<AssociateRecord> associates) =>
        new()
        {
            GatePassId = source.GatePassId,
            GatePassNo = source.GatePassNo,
            ControlNo = source.ControlNo,
            FormTypeCode = source.FormTypeCode,
            FormName = source.FormName,
            FormDate = source.FormDate,
            RequesterUserId = source.RequesterUserId,
            RequesterEmployeeId = source.RequesterEmployeeId,
            PreparedBySignatureFileId = source.PreparedBySignatureFileId,
            EmployeeId = source.EmployeeId,
            FullName = source.FullName,
            DepartmentName = source.DepartmentName,
            PositionName = source.PositionName,
            AuthorizedEmployeeId = source.AuthorizedEmployeeId,
            AuthorizedEmployeeNo = source.AuthorizedEmployeeNo,
            AuthorizedEmployeeName = source.AuthorizedEmployeeName,
            AuthorizedDepartmentId = source.AuthorizedDepartmentId,
            AuthorizedDepartmentName = source.AuthorizedDepartmentName,
            Destination = source.Destination,
            Purpose = source.Purpose,
            MaterialRemarks = source.MaterialRemarks,
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
            ActualOutSignatureFileId = source.ActualOutSignatureFileId,
            ActualInAt = source.ActualInAt,
            ActualInSignatureFileId = source.ActualInSignatureFileId,
            CompletedAt = source.CompletedAt,
            ApplicationOutcomeCode = source.ApplicationOutcomeCode,
            CreatedAt = source.CreatedAt,
            UpdatedAt = source.UpdatedAt,
            WillReturn = source.WillReturn,
            VehicleUsageCode = source.VehicleUsageCode,
            PrivateVehicleDetails = source.PrivateVehicleDetails,
            VehicleId = source.VehicleId,
            VehicleName = source.VehicleName,
            PlateNumber = source.PlateNumber,
            DriverId = source.DriverId,
            DriverName = source.DriverName,
            QrExpiresAt = source.QrExpiresAt,
            VersionNo = source.VersionNo,
            PreparedBySignatureWidth = source.PreparedBySignatureWidth,
            PreparedBySignatureYOffset = source.PreparedBySignatureYOffset,
            ActualOutSignatureWidth = source.ActualOutSignatureWidth,
            ActualOutSignatureYOffset = source.ActualOutSignatureYOffset,
            ActualInSignatureWidth = source.ActualInSignatureWidth,
            ActualInSignatureYOffset = source.ActualInSignatureYOffset,
            ApprovalSteps = steps,
            Scans = scans,
            MaterialItems = materialItems,
            ProofFileIds = proofFileIds,
            Associates = associates
        };
}

