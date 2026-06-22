using GatePassSystem.Api.Infrastructure;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GatePassSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/employees")]
public sealed class EmployeesController(
    IEmployeeService employeeService) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<EmployeeLookupResponse>>>> Search(
        [FromQuery] string? search,
        [FromQuery] int limit = 100,
        CancellationToken cancellationToken = default) =>
        Success(await employeeService.SearchActiveAsync(
            search,
            limit,
            cancellationToken));
}
