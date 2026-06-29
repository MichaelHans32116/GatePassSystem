using System.Text.Json;
using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;

namespace GatePassSystem.Project.Services;

public sealed class GatePassService(
    IEmployeeRepository employeeRepository,
    IGatePassRepository gatePassRepository,
    IFleetRepository fleetRepository,
    IOperationsRepository operationsRepository,
    ISignatureRepository signatureRepository,
    IQrTokenService qrTokenService) : IGatePassService
{
    public async Task<ServiceResult<GatePassCreationResult>> CreateAsync(
        long requesterUserId,
        CreateGatePassRequest request,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        var requester = await employeeRepository.GetRequesterContextAsync(
            requesterUserId,
            cancellationToken);
        if (requester is null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "REQUESTER_NOT_FOUND",
                "No active employee record is linked to this account.");
        }

        var validationError = Validate(request);
        if (validationError is not null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "VALIDATION_ERROR",
                validationError);
        }

        var departmentError = ResolveRequesterDepartment(
            requester,
            request.RequesterDepartmentId,
            out requester);
        if (departmentError is not null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "INVALID_REQUESTER_DEPARTMENT",
                departmentError);
        }

        var signatureError = await ValidatePreparedSignatureAsync(
            requester.UserId,
            request.PreparedBySignatureFileId,
            cancellationToken);
        if (signatureError is not null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "INVALID_PREPARED_SIGNATURE",
                signatureError);
        }

        var associatesResult = await ResolveAssociatesAsync(
            request.Associates,
            requester,
            primaryEmployee: null,
            cancellationToken);
        if (associatesResult.Error is not null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "INVALID_ASSOCIATE",
                associatesResult.Error);
        }

        var associates = associatesResult.Associates;

        var isImmediateSuperior =
            requester.Roles.Contains(
                "IMMEDIATE_SUPERIOR",
                StringComparer.OrdinalIgnoreCase);
        var usesCompanyVehicle =
            request.VehicleUsageCode.Equals(
                "COMPANY",
                StringComparison.OrdinalIgnoreCase);
        var requiresSuperior = !isImmediateSuperior;
        var requiresPresident = usesCompanyVehicle || isImmediateSuperior;

        var routeCodes = new List<string>();
        if (requiresSuperior)
        {
            routeCodes.Add("SUPERIOR");
        }

        if (usesCompanyVehicle)
        {
            routeCodes.Add("HRAD_ASSIGN");
        }

        if (requiresPresident)
        {
            routeCodes.Add("PRESIDENT");
        }

        routeCodes.Add("PAS");

        var route = new List<(string StepCode, long ApproverUserId)>();
        foreach (var stepCode in routeCodes)
        {
            var approverId = await gatePassRepository.FindApproverAsync(
                stepCode,
                "PERSON_GATE_PASS",
                false,
                requester.UserId,
                stepCode == "SUPERIOR" ? requester.DepartmentId : null,
                stepCode == "SUPERIOR" ? requester.PositionId : null,
                cancellationToken);

            if (!approverId.HasValue)
            {
                return ServiceResult<GatePassCreationResult>.Failure(
                    "APPROVER_NOT_CONFIGURED",
                    $"No active {stepCode} approver is configured.");
            }

            route.Add((stepCode, approverId.Value));
        }

        var draft = await gatePassRepository.CreateDraftAsync(
            requester,
            request,
            requiresSuperior,
            requiresPresident,
            associates,
            traceId,
            cancellationToken);

        if (usesCompanyVehicle && request.VehicleId.HasValue)
        {
            var reserved = await fleetRepository.ReserveAsync(
                draft.GatePassId,
                request.VehicleId.Value,
                request.DriverId,
                request.ExpectedOutAt.UtcDateTime,
                request.ExpectedInAt?.UtcDateTime,
                cancellationToken);

            if (!reserved)
            {
                return ServiceResult<GatePassCreationResult>.Failure(
                    "VEHICLE_UNAVAILABLE",
                    "The selected company vehicle is unavailable for this schedule.");
            }
        }

        await gatePassRepository.CreateApprovalRouteAsync(
            draft.GatePassId,
            route,
            cancellationToken);

        var submitted = await gatePassRepository.SubmitAsync(
            draft.GatePassId,
            requester.UserId,
            $"PENDING_{route[0].StepCode}",
            traceId,
            cancellationToken);

        await operationsRepository.WriteAuditAsync(
            requester.UserId,
            "GATE_PASS_SUBMITTED",
            "GATE_PASS",
            submitted.GatePassId,
            JsonSerializer.Serialize(new
            {
                submitted.GatePassNo,
                ApprovalRoute = routeCodes
            }),
            null,
            null,
            traceId,
            cancellationToken);

        return ServiceResult<GatePassCreationResult>.Success(
            new GatePassCreationResult(submitted, routeCodes));
    }

    public async Task<ServiceResult<GatePassCreationResult>> CreateMaterialAsync(
        long requesterUserId,
        CreateMaterialGatePassRequest request,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        var requester = await employeeRepository.GetRequesterContextAsync(
            requesterUserId,
            cancellationToken);
        if (requester is null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "REQUESTER_NOT_FOUND",
                "No active employee record is linked to this account.");
        }

        var validationError = ValidateMaterial(request);
        if (validationError is not null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "VALIDATION_ERROR",
                validationError);
        }

        var departmentError = ResolveRequesterDepartment(
            requester,
            request.RequesterDepartmentId,
            out requester);
        if (departmentError is not null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "INVALID_REQUESTER_DEPARTMENT",
                departmentError);
        }

        var authorizedEmployee =
            await employeeRepository.GetActiveEmployeeAsync(
                request.AuthorizedEmployeeId,
                cancellationToken);
        if (authorizedEmployee is null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "AUTHORIZED_EMPLOYEE_NOT_FOUND",
                "Select an active employee who will bring out the materials.");
        }

        if (!authorizedEmployee.DepartmentId.HasValue)
        {
            authorizedEmployee = new EmployeeLookupRecord
            {
                EmployeeRecordId = authorizedEmployee.EmployeeRecordId,
                EmployeeId = authorizedEmployee.EmployeeId,
                FullName = authorizedEmployee.FullName,
                DepartmentId = requester.DepartmentId,
                DepartmentName = requester.DepartmentName,
                PositionName = authorizedEmployee.PositionName
            };
        }

        var associatesResult = await ResolveAssociatesAsync(
            request.Associates,
            requester,
            primaryEmployee: authorizedEmployee,
            cancellationToken);
        if (associatesResult.Error is not null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "INVALID_ASSOCIATE",
                associatesResult.Error);
        }

        var associates = associatesResult.Associates;

        var signatureError = await ValidatePreparedSignatureAsync(
            requester.UserId,
            request.PreparedBySignatureFileId,
            cancellationToken);
        if (signatureError is not null)
        {
            return ServiceResult<GatePassCreationResult>.Failure(
                "INVALID_PREPARED_SIGNATURE",
                signatureError);
        }

        var requesterIsImmediateSuperior = requester.Roles.Contains(
            "IMMEDIATE_SUPERIOR",
            StringComparer.OrdinalIgnoreCase);
        var usesCompanyVehicle = request.VehicleUsageCode.Equals(
            "COMPANY", StringComparison.OrdinalIgnoreCase);
        var routeCodes = new List<string>();
        if (!requesterIsImmediateSuperior) routeCodes.Add("SUPERIOR");
        if (usesCompanyVehicle) routeCodes.Add("HRAD_ASSIGN");
        routeCodes.Add("PAS");
        var route = new List<(string StepCode, long ApproverUserId)>();

        foreach (var stepCode in routeCodes)
        {
            var approverId = await gatePassRepository.FindApproverAsync(
                stepCode,
                "MATERIAL_GATE_PASS",
                false,
                requester.UserId,
                stepCode == "SUPERIOR" ? requester.DepartmentId : null,
                stepCode == "SUPERIOR" ? requester.PositionId : null,
                cancellationToken);

            if (!approverId.HasValue)
            {
                return ServiceResult<GatePassCreationResult>.Failure(
                    "APPROVER_NOT_CONFIGURED",
                    stepCode switch
                    {
                        "PAS" => "No active PAS approver is configured.",
                        "HRAD_ASSIGN" => "No active HRAD approver is configured.",
                        _ => "No active immediate superior is configured for this requester."
                    });
            }

            route.Add((stepCode, approverId.Value));
        }

        var draft = await gatePassRepository.CreateMaterialDraftAsync(
            requester,
            authorizedEmployee,
            request,
            associates,
            traceId,
            cancellationToken);

        await gatePassRepository.CreateApprovalRouteAsync(
            draft.GatePassId,
            route,
            cancellationToken);

        var submitted = await gatePassRepository.SubmitAsync(
            draft.GatePassId,
            requester.UserId,
            $"PENDING_{route[0].StepCode}",
            traceId,
            cancellationToken);

        await operationsRepository.WriteAuditAsync(
            requester.UserId,
            "MATERIAL_GATE_PASS_SUBMITTED",
            "FORM_REQUEST",
            submitted.GatePassId,
            JsonSerializer.Serialize(new
            {
                submitted.GatePassNo,
                submitted.ControlNo,
                submitted.FormTypeCode,
                AuthorizedEmployee = authorizedEmployee.EmployeeId,
                ItemCount = request.Items.Count,
                ApprovalRoute = routeCodes
            }),
            null,
            null,
            traceId,
            cancellationToken);

        return ServiceResult<GatePassCreationResult>.Success(
            new GatePassCreationResult(submitted, routeCodes));
    }

    public Task<GatePassDetail?> GetDetailAsync(
        long gatePassId,
        CancellationToken cancellationToken = default) =>
        gatePassRepository.GetDetailAsync(gatePassId, cancellationToken);

    public Task<PagedResult<GatePassRecord>> GetMyRequestsAsync(
        long requesterUserId,
        GatePassQuery query,
        CancellationToken cancellationToken = default) =>
        gatePassRepository.GetPagedAsync(
            query,
            requesterUserId,
            cancellationToken);

    public Task<PagedResult<GatePassRecord>> GetAllAsync(
        GatePassQuery query,
        CancellationToken cancellationToken = default) =>
        gatePassRepository.GetPagedAsync(query, null, cancellationToken);

    public async Task<ServiceResult<QrTokenResponse>> GetQrTokenAsync(
        long gatePassId,
        CancellationToken cancellationToken = default)
    {
        var detail = await gatePassRepository.GetDetailAsync(
            gatePassId,
            cancellationToken);
        if (detail is null)
        {
            return ServiceResult<QrTokenResponse>.Failure(
                "GATE_PASS_NOT_FOUND",
                "Gate pass was not found.");
        }

        if (detail.ApprovedAt is null ||
            detail.GatePassStatusCode is
                "REJECTED" or "CANCELLED" or "EXPIRED" or "DRAFT")
        {
            return ServiceResult<QrTokenResponse>.Failure(
                "QR_NOT_AVAILABLE",
                "QR is available only after final approval.");
        }

        var qrToken = qrTokenService.CreateToken(detail.GatePassId);
        // Refresh the expiry when it is missing OR already in the past, so an
        // approved-but-stale pass (approved more than 7 days ago) can still produce
        // a scannable QR. The token itself is deterministic (HMAC of the gate-pass
        // id), so extending the expiry keeps the existing QR valid.
        var qrExpiresAt = (detail.QrExpiresAt is null || detail.QrExpiresAt < DateTime.UtcNow)
            ? DateTime.UtcNow.AddDays(7)
            : detail.QrExpiresAt.Value;
        await gatePassRepository.EnsureQrTokenAsync(
            detail.GatePassId,
            qrTokenService.HashToken(qrToken),
            qrExpiresAt,
            cancellationToken);

        return ServiceResult<QrTokenResponse>.Success(
            new QrTokenResponse(
                detail.GatePassId,
                detail.GatePassNo,
                qrToken,
                qrExpiresAt != default
                    ? new DateTimeOffset(
                        DateTime.SpecifyKind(
                            qrExpiresAt,
                            DateTimeKind.Utc))
                    : null));
    }

    public Task<bool> DeleteForTestingAsync(
        long gatePassId,
        CancellationToken cancellationToken = default) =>
        gatePassRepository.DeleteForTestingAsync(
            gatePassId,
            cancellationToken);

    private async Task<(IReadOnlyList<AssociateRecord> Associates, string? Error)>
        ResolveAssociatesAsync(
            IReadOnlyList<AssociateRequest>? requested,
            RequesterContext requester,
            EmployeeLookupRecord? primaryEmployee,
            CancellationToken cancellationToken)
    {
        var resolved = new List<AssociateRecord>();
        var seenEmployeeIds = new HashSet<long>();
        var lineNo = 1;

        // Material passes seed line_no=1 with the primary authorized employee.
        if (primaryEmployee is not null)
        {
            resolved.Add(new AssociateRecord
            {
                LineNo = lineNo++,
                EmployeeId = primaryEmployee.EmployeeRecordId,
                Name = primaryEmployee.FullName,
                DepartmentId = primaryEmployee.DepartmentId
            });
            seenEmployeeIds.Add(primaryEmployee.EmployeeRecordId);
        }

        if (requested is null || requested.Count == 0)
        {
            return (resolved, null);
        }

        if (requested.Count > 20)
        {
            return (resolved, "A maximum of 20 associates is allowed.");
        }

        foreach (var item in requested)
        {
            if (item.EmployeeId <= 0)
            {
                return (resolved,
                    "Each associate must be selected from the employee directory.");
            }

            if (!seenEmployeeIds.Add(item.EmployeeId))
            {
                return (resolved, "The same associate was added more than once.");
            }

            var employee = await employeeRepository.GetActiveEmployeeAsync(
                item.EmployeeId,
                cancellationToken);
            if (employee is null)
            {
                return (resolved,
                    "One of the selected associates is not an active employee.");
            }

            resolved.Add(new AssociateRecord
            {
                LineNo = lineNo++,
                EmployeeId = employee.EmployeeRecordId,
                Name = employee.FullName,
                DepartmentId = employee.DepartmentId ?? requester.DepartmentId
            });
        }

        return (resolved, null);
    }

    private static string? Validate(CreateGatePassRequest request)
    {
        if (request.PreparedBySignatureFileId.HasValue)
        {
            return "Person gate passes do not use a prepared-by signature.";
        }

        if (string.IsNullOrWhiteSpace(request.Destination) ||
            string.IsNullOrWhiteSpace(request.Purpose))
        {
            return "Destination and purpose are required.";
        }

        if (request.ExpectedOutAt == default)
        {
            return "Expected Time Out is required.";
        }

        if (request.WillReturn && !request.ExpectedInAt.HasValue)
        {
            return "Expected Time In is required when the employee will return.";
        }

        if (request.ExpectedInAt.HasValue &&
            request.ExpectedInAt <= request.ExpectedOutAt)
        {
            return "Expected Time In must be later than Expected Time Out.";
        }

        var usage = request.VehicleUsageCode.Trim().ToUpperInvariant();
        if (usage is not ("NONE" or "PRIVATE" or "COMPANY"))
        {
            return "Vehicle usage must be NONE, PRIVATE, or COMPANY.";
        }

        if (usage == "PRIVATE" &&
            string.IsNullOrWhiteSpace(request.PrivateVehicleDetails))
        {
            return "Private vehicle details are required.";
        }

        return null;
    }

    private static string? ValidateMaterial(
        CreateMaterialGatePassRequest request)
    {
        if (request.AuthorizedEmployeeId <= 0)
        {
            return "Select the employee authorized to bring out the materials.";
        }

        if (request.FormDate == default)
        {
            return "Material gate pass date is required.";
        }

        if (request.Items.Count is < 1 or > 20)
        {
            return "Add between 1 and 20 material items.";
        }

        for (var index = 0; index < request.Items.Count; index++)
        {
            var item = request.Items[index];
            if (string.IsNullOrWhiteSpace(item.Description) ||
                string.IsNullOrWhiteSpace(item.Unit) ||
                item.Quantity <= 0)
            {
                return $"Material item {index + 1} needs a description, positive quantity, and unit.";
            }
        }

        if (request.ProofFileIds is null || request.ProofFileIds.Count < 1)
        {
            return "At least 1 photo proof is required for Material Gate Pass.";
        }

        if (request.ProofFileIds.Count > request.Items.Count)
        {
            return $"A maximum of {request.Items.Count} photo proof(s) are allowed for this gate pass (matching the item count).";
        }

        return null;
    }

    private async Task<string?> ValidatePreparedSignatureAsync(
        long requesterUserId,
        long? signatureFileId,
        CancellationToken cancellationToken)
    {
        if (!signatureFileId.HasValue)
        {
            return null;
        }

        var signature = await signatureRepository.GetAsync(
            signatureFileId.Value,
            cancellationToken);
        return signature is null ||
               signature.OwnerUserId != requesterUserId ||
               !signature.IsActive
            ? "The prepared-by signature must be an active signature uploaded by the requester."
            : null;
    }

    private static string? ResolveRequesterDepartment(
        RequesterContext source,
        long? requestedDepartmentId,
        out RequesterContext resolved)
    {
        resolved = source;

        if (source.DepartmentId.HasValue)
        {
            if (requestedDepartmentId.HasValue &&
                requestedDepartmentId.Value != source.DepartmentId.Value)
            {
                return "This account must submit under its assigned home department.";
            }

            return null;
        }

        if (!requestedDepartmentId.HasValue)
        {
            return "Select the department represented by this request.";
        }

        var selectedDepartment = source.RequestableDepartments.FirstOrDefault(
            department =>
                department.DepartmentId == requestedDepartmentId.Value);
        if (selectedDepartment is null)
        {
            return "The selected department is not assigned to this account.";
        }

        resolved = new RequesterContext
        {
            UserId = source.UserId,
            EmployeeRecordId = source.EmployeeRecordId,
            DepartmentId = selectedDepartment.DepartmentId,
            DepartmentName = selectedDepartment.DepartmentName,
            PositionId = source.PositionId,
            EmployeeId = source.EmployeeId,
            FullName = source.FullName,
            Roles = source.Roles,
            RequestableDepartments = source.RequestableDepartments
        };
        return null;
    }
}
