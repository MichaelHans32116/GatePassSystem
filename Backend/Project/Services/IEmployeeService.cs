using GatePassSystem.Project.DTOs.GatePass;

namespace GatePassSystem.Project.Services;

public interface IEmployeeService
{
    Task<IReadOnlyList<EmployeeLookupResponse>> SearchActiveAsync(
        string? search,
        int limit,
        CancellationToken cancellationToken = default);
}
