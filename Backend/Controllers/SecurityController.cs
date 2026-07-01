using FormRequestSystem.Api.Infrastructure;
using FormRequestSystem.Api.Infrastructure.Authorization;
using FormRequestSystem.Project.DTOs.Common;
using FormRequestSystem.Project.DTOs.GatePass;
using FormRequestSystem.Project.DTOs.Security;
using FormRequestSystem.Project.Models;
using FormRequestSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FormRequestSystem.Api.Controllers;

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

    [HttpGet("employee/by-id/{employeeId}/passes")]
    public async Task<ActionResult<ApiResponse<EmployeePassesResult>>> EmployeePassesById(
        string employeeId, CancellationToken cancellationToken)
    {
        var recordId = await securityService.GetEmployeeRecordIdByEmployeeIdAsync(employeeId, cancellationToken);
        if (!recordId.HasValue)
        {
            return ServiceFailure(ServiceResult<EmployeePassesResult>.Failure(
                "EMPLOYEE_NOT_FOUND",
                $"No active employee found with ID '{employeeId}'."));
        }

        return Success(await securityService.GetEmployeePassesAsync(recordId.Value, cancellationToken));
    }

    [HttpGet("passes/lookup/{identifier}")]
    public async Task<ActionResult<ApiResponse<long>>> LookupPass(
        string identifier, CancellationToken cancellationToken)
    {
        var dbId = await securityService.LookupGatePassIdAsync(identifier, cancellationToken);
        if (!dbId.HasValue)
        {
            return ServiceFailure(ServiceResult<long>.Failure(
                "GATE_PASS_NOT_FOUND",
                "Gate pass was not found."));
        }
        return Success(dbId.Value);
    }
}

