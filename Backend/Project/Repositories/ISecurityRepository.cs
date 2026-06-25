using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.DTOs.Security;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public interface ISecurityRepository
{
    Task<IReadOnlyList<SecurityQueueItem>> GetQueueAsync(
        CancellationToken cancellationToken = default);

    Task<SecurityScanResult> ScanAsync(
        long guardUserId,
        string? qrTokenHash,
        long? employeeRecordId,
        string? manualGatePassNo,
        string providedIdentifierHash,
        string traceId,
        long? signatureFileId,
        CancellationToken cancellationToken = default);

    Task<EmployeePassesResult> GetEmployeePassesAsync(
        long employeeRecordId,
        CancellationToken cancellationToken = default);

    Task<long?> GetEmployeeRecordIdByEmployeeIdAsync(
        string employeeId,
        CancellationToken cancellationToken = default);

    Task<long?> LookupGatePassIdAsync(
        string identifier,
        CancellationToken cancellationToken = default);
}

