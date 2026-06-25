using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public interface IOperationsRepository
{
    Task<DashboardSnapshot> GetDashboardAsync(
        DateTime? fromAppliedAt,
        DateTime? toAppliedAt,
        long? departmentId,
        CancellationToken cancellationToken = default);

    Task WriteAuditAsync(
        long? actorUserId,
        string actionCode,
        string entityType,
        long? entityId,
        string? detailsJson,
        string? ipAddress,
        string? userAgent,
        string traceId,
        CancellationToken cancellationToken = default);
}

