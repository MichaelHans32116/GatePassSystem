using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.DTOs.Security;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Services;

public interface ISecurityService
{
    Task<IReadOnlyList<SecurityQueueItem>> GetQueueAsync(
        CancellationToken cancellationToken = default);

    Task<ServiceResult<SecurityScanResult>> ScanAsync(
        long guardUserId,
        SecurityScanRequest request,
        string traceId,
        CancellationToken cancellationToken = default);

    Task<EmployeePassesResult> GetEmployeePassesAsync(
        long employeeRecordId,
        CancellationToken cancellationToken = default);
}

