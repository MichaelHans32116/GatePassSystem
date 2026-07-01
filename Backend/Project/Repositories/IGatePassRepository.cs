using FormRequestSystem.Project.DTOs.Common;
using FormRequestSystem.Project.DTOs.GatePass;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

public interface IGatePassRepository
{
    Task<GatePassRecord> CreateDraftAsync(
        RequesterContext requester,
        CreateGatePassRequest request,
        bool requiresSuperior,
        bool requiresPresident,
        IReadOnlyList<AssociateRecord> associates,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<GatePassRecord> CreateMaterialDraftAsync(
        RequesterContext requester,
        EmployeeLookupRecord authorizedEmployee,
        CreateMaterialGatePassRequest request,
        IReadOnlyList<AssociateRecord> associates,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<long?> FindApproverAsync(
        string approvalStepCode,
        string formTypeCode,
        bool requireExactFormType,
        long requesterUserId,
        long? departmentId,
        long? positionId,
        CancellationToken cancellationToken = default);

    Task CreateApprovalRouteAsync(
        long gatePassId,
        IReadOnlyList<(string StepCode, long ApproverUserId)> route,
        CancellationToken cancellationToken = default);

    Task<GatePassRecord> SubmitAsync(
        long gatePassId,
        long actorUserId,
        string initialStatus,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<GatePassDetail?> GetDetailAsync(
        long gatePassId,
        CancellationToken cancellationToken = default);

    Task EnsureQrTokenAsync(
        long gatePassId,
        string qrTokenHash,
        DateTime qrExpiresAt,
        CancellationToken cancellationToken = default);

    Task<PagedResult<GatePassRecord>> GetPagedAsync(
        GatePassQuery query,
        long? requesterUserId,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteForTestingAsync(
        long gatePassId,
        CancellationToken cancellationToken = default);
}

