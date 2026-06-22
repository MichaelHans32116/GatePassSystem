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
            traceId,
            cancellationToken);

        if (usesCompanyVehicle)
        {
            var reserved = await fleetRepository.ReserveAsync(
                draft.GatePassId,
                request.VehicleId!.Value,
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

        string[] routeCodes = ["SUPERIOR", "PAS"];
        var route = new List<(string StepCode, long ApproverUserId)>();

        foreach (var stepCode in routeCodes)
        {
            var approverId = await gatePassRepository.FindApproverAsync(
                stepCode,
                "MATERIAL_GATE_PASS",
                stepCode == "PAS",
                requester.UserId,
                stepCode == "SUPERIOR" ? requester.DepartmentId : null,
                stepCode == "SUPERIOR" ? requester.PositionId : null,
                cancellationToken);

            if (!approverId.HasValue)
            {
                return ServiceResult<GatePassCreationResult>.Failure(
                    "APPROVER_NOT_CONFIGURED",
                    stepCode == "PAS"
                        ? "Ma'am Alona is not configured as the Material Gate Pass PAS approver."
                        : "No active immediate superior is configured for this requester.");
            }

            route.Add((stepCode, approverId.Value));
        }

        var draft = await gatePassRepository.CreateMaterialDraftAsync(
            requester,
            authorizedEmployee,
            request,
            traceId,
            cancellationToken);

        await gatePassRepository.CreateApprovalRouteAsync(
            draft.GatePassId,
            route,
            cancellationToken);

        var submitted = await gatePassRepository.SubmitAsync(
            draft.GatePassId,
            requester.UserId,
            "PENDING_SUPERIOR",
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

        if (detail.FormTypeCode != "PERSON_GATE_PASS")
        {
            return ServiceResult<QrTokenResponse>.Failure(
                "QR_NOT_AVAILABLE",
                "Material gate passes use the approved printable form and do not use Time Out/Time In QR scanning.");
        }

        if (detail.ApprovedAt is null ||
            detail.GatePassStatusCode is
                "REJECTED" or "CANCELLED" or "EXPIRED" or "DRAFT")
        {
            return ServiceResult<QrTokenResponse>.Failure(
                "QR_NOT_AVAILABLE",
                "QR is available only after final approval.");
        }

        return ServiceResult<QrTokenResponse>.Success(
            new QrTokenResponse(
                detail.GatePassId,
                detail.GatePassNo,
                qrTokenService.CreateToken(detail.GatePassId),
                detail.QrExpiresAt.HasValue
                    ? new DateTimeOffset(
                        DateTime.SpecifyKind(
                            detail.QrExpiresAt.Value,
                            DateTimeKind.Utc))
                    : null));
    }

    public Task<bool> DeleteForTestingAsync(
        long gatePassId,
        CancellationToken cancellationToken = default) =>
        gatePassRepository.DeleteForTestingAsync(
            gatePassId,
            cancellationToken);

    private static string? Validate(CreateGatePassRequest request)
    {
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

        if (usage == "COMPANY" && !request.VehicleId.HasValue)
        {
            return "A company vehicle is required.";
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
}
