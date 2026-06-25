using GatePassSystem.Api.Infrastructure;
using GatePassSystem.Api.Infrastructure.Authorization;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.DTOs.Security;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GatePassSystem.Api.Controllers;

[ApiController]
[Authorize(Roles = "SECURITY")]
[Route("api/security")]
public sealed class SecurityController(
    ISecurityService securityService) : ApiControllerBase
{
    [HttpGet("queue")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<SecurityQueueItem>>>> Queue(
        CancellationToken cancellationToken) =>
        Success(await securityService.GetQueueAsync(cancellationToken));

    [HttpPost("scans")]
    public async Task<ActionResult<ApiResponse<SecurityScanResult>>> Scan(
        [FromBody] SecurityScanRequest request,
        CancellationToken cancellationToken)
    {
        var result = await securityService.ScanAsync(
            CurrentUserId,
            request,
            HttpContext.TraceIdentifier,
            cancellationToken);
        return result.IsSuccess
            ? Success(result.Value!, result.Value!.Message)
            : ServiceFailure(result);
    }

    [HttpGet("employee/{employeeRecordId:long}/passes")]
    public async Task<ActionResult<ApiResponse<EmployeePassesResult>>> EmployeePasses(
        long employeeRecordId, CancellationToken cancellationToken) =>
        Success(await securityService.GetEmployeePassesAsync(employeeRecordId, cancellationToken));
}
