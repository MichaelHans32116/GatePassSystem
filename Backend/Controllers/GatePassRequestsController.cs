using GatePassSystem.Api.Infrastructure;
using GatePassSystem.Api.Infrastructure.Authorization;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GatePassSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/gate-pass-requests")]
[Route("api/form-requests")]
public sealed class GatePassRequestsController(
    IGatePassService gatePassService) : ApiControllerBase
{
    [Authorize(Policy = GatePassPermissions.CreateOwn)]
    [HttpPost]
    public async Task<ActionResult<ApiResponse<GatePassCreationResult>>> Create(
        [FromBody] CreateGatePassRequest request,
        CancellationToken cancellationToken)
    {
        var result = await gatePassService.CreateAsync(
            CurrentUserId,
            request,
            HttpContext.TraceIdentifier,
            cancellationToken);
        return result.IsSuccess
            ? Success(result.Value!, "Person gate pass submitted successfully.")
            : ServiceFailure(result);
    }

    [Authorize(Policy = GatePassPermissions.CreateOwn)]
    [HttpPost("material")]
    public async Task<ActionResult<ApiResponse<GatePassCreationResult>>> CreateMaterial(
        [FromBody] CreateMaterialGatePassRequest request,
        CancellationToken cancellationToken)
    {
        var result = await gatePassService.CreateMaterialAsync(
            CurrentUserId,
            request,
            HttpContext.TraceIdentifier,
            cancellationToken);
        return result.IsSuccess
            ? Success(result.Value!, "Material gate pass submitted successfully.")
            : ServiceFailure(result);
    }

    [Authorize(Policy = GatePassPermissions.ReadOwn)]
    [HttpGet("my")]
    public async Task<ActionResult<PagedApiResponse<GatePassRecord>>> My(
        [FromQuery] GatePassQuery query,
        CancellationToken cancellationToken) =>
        Paged(await gatePassService.GetMyRequestsAsync(
            CurrentUserId,
            query,
            cancellationToken));

    [Authorize(Policy = GatePassPermissions.ReadAll)]
    [HttpGet]
    public async Task<ActionResult<PagedApiResponse<GatePassRecord>>> All(
        [FromQuery] GatePassQuery query,
        CancellationToken cancellationToken) =>
        Paged(await gatePassService.GetAllAsync(query, cancellationToken));

    [HttpGet("{id:long}")]
    public async Task<ActionResult<ApiResponse<GatePassDetail>>> Detail(
        long id,
        CancellationToken cancellationToken)
    {
        var detail = await gatePassService.GetDetailAsync(id, cancellationToken);
        if (detail is null)
        {
            return NotFound(new ApiErrorResponse(
                "GATE_PASS_NOT_FOUND",
                "Gate pass was not found.",
                null,
                HttpContext.TraceIdentifier));
        }

        var canRead =
            detail.RequesterUserId == CurrentUserId ||
            HasPermission(GatePassPermissions.ReadAll) ||
            HasPermission(GatePassPermissions.Scan) ||
            detail.ApprovalSteps.Any(
                step => step.AssignedApproverUserId == CurrentUserId) ||
            (
                detail.RequesterUserId != CurrentUserId &&
                HasPermission(GatePassPermissions.NotePas) &&
                detail.GatePassStatusCode == "PENDING_PAS" &&
                detail.ApprovalSteps.Any(
                    step =>
                        step.ApprovalStepCode == "PAS" &&
                        step.ApprovalStatusCode == "PENDING")
            );

        return canRead
            ? Success(detail)
            : NotFound(new ApiErrorResponse(
                "GATE_PASS_NOT_FOUND",
                "Gate pass was not found.",
                null,
                HttpContext.TraceIdentifier));
    }

    [HttpGet("{id:long}/qr")]
    public async Task<ActionResult<ApiResponse<QrTokenResponse>>> Qr(
        long id,
        CancellationToken cancellationToken)
    {
        var detail = await gatePassService.GetDetailAsync(id, cancellationToken);
        var canRead =
            detail is not null &&
            (
                detail.RequesterUserId == CurrentUserId ||
                HasPermission(GatePassPermissions.ReadAll) ||
                HasPermission(GatePassPermissions.Scan) ||
                detail.ApprovalSteps.Any(
                    step => step.AssignedApproverUserId == CurrentUserId) ||
                (
                    detail.RequesterUserId != CurrentUserId &&
                    HasPermission(GatePassPermissions.NotePas) &&
                    detail.GatePassStatusCode == "PENDING_PAS" &&
                    detail.ApprovalSteps.Any(
                        step =>
                            step.ApprovalStepCode == "PAS" &&
                            step.ApprovalStatusCode == "PENDING")
                )
            );

        if (!canRead)
        {
            return NotFound(new ApiErrorResponse(
                "GATE_PASS_NOT_FOUND",
                "Gate pass was not found.",
                null,
                HttpContext.TraceIdentifier));
        }

        var result = await gatePassService.GetQrTokenAsync(
            id,
            cancellationToken);
        return result.IsSuccess
            ? Success(result.Value!)
            : ServiceFailure(result);
    }

    [Authorize(Policy = GatePassPermissions.UsersManage)]
    [HttpDelete("{id:long}/test-delete")]
    public async Task<IActionResult> DeleteForTesting(
        long id,
        CancellationToken cancellationToken)
    {
        var deleted = await gatePassService.DeleteForTestingAsync(
            id,
            cancellationToken);

        return deleted
            ? NoContent()
            : NotFound(new ApiErrorResponse(
                "GATE_PASS_NOT_FOUND",
                "Gate pass was not found.",
                null,
                HttpContext.TraceIdentifier));
    }
}
