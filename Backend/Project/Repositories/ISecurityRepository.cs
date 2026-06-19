using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public interface ISecurityRepository
{
    Task<IReadOnlyList<SecurityQueueItem>> GetQueueAsync(
        CancellationToken cancellationToken = default);

    Task<SecurityScanResult> ScanAsync(
        long guardUserId,
        string? qrTokenHash,
        string? manualGatePassNo,
        string providedIdentifierHash,
        string traceId,
        CancellationToken cancellationToken = default);
}

