using FormRequestSystem.Project.DTOs.Common;
using FormRequestSystem.Project.DTOs.GatePass;
using FormRequestSystem.Project.DTOs.Security;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Services;

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

    Task<long?> GetEmployeeRecordIdByEmployeeIdAsync(
        string employeeId,
        CancellationToken cancellationToken = default);

    Task<long?> LookupGatePassIdAsync(
        string identifier,
        CancellationToken cancellationToken = default);
}


