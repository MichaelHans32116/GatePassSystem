using FormRequestSystem.Api.Infrastructure;
using FormRequestSystem.Api.Infrastructure.Authorization;
using FormRequestSystem.Project.Models;
using FormRequestSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FormRequestSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/dashboard")]
public sealed class DashboardController(
    IDashboardService dashboardService) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<DashboardSnapshot>>> Get(
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] long? departmentId,
        CancellationToken cancellationToken)
    {
        if (!HasPermission(GatePassPermissions.ReadAll) &&
            !HasPermission(GatePassPermissions.ReportsView) &&
            !HasPermission(GatePassPermissions.MonitorOutside))
        {
            return Forbid();
        }

        if (departmentId.HasValue &&
            !HasPermission(GatePassPermissions.ReadAll) &&
            !HasPermission(GatePassPermissions.ReportsView))
        {
            return Forbid();
        }

        return Success(await dashboardService.GetAsync(
            from,
            to,
            departmentId,
            cancellationToken));
    }
}

