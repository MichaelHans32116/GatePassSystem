using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public interface IEmployeeRepository
{
    Task<RequesterContext?> GetRequesterContextAsync(
        long userId,
        CancellationToken cancellationToken = default);

    Task<EmployeeLookupRecord?> GetActiveEmployeeAsync(
        long employeeRecordId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<EmployeeLookupRecord>> SearchActiveEmployeesAsync(
        string? search,
        int limit,
        CancellationToken cancellationToken = default);
}
