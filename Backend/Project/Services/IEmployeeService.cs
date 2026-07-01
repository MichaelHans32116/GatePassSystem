using FormRequestSystem.Project.DTOs.GatePass;

namespace FormRequestSystem.Project.Services;

public interface IEmployeeService
{
    Task<IReadOnlyList<EmployeeLookupResponse>> SearchActiveAsync(
        string? search,
        int limit,
        CancellationToken cancellationToken = default);
}

