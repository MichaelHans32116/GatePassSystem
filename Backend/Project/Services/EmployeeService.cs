using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Repositories;

namespace GatePassSystem.Project.Services;

public sealed class EmployeeService(
    IEmployeeRepository employeeRepository) : IEmployeeService
{
    public async Task<IReadOnlyList<EmployeeLookupResponse>> SearchActiveAsync(
        string? search,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var employees = await employeeRepository.SearchActiveEmployeesAsync(
            search,
            limit,
            cancellationToken);

        return employees.Select(employee => new EmployeeLookupResponse(
            employee.EmployeeRecordId,
            employee.EmployeeId,
            employee.FullName,
            employee.DepartmentId,
            employee.DepartmentName,
            employee.PositionName)).ToArray();
    }
}
