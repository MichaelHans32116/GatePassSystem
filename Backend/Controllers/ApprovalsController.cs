using FormRequestSystem.Api.Infrastructure;
using FormRequestSystem.Project.DTOs.GatePass;
using FormRequestSystem.Project.Models;
using FormRequestSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FormRequestSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/approvals")]
public sealed class ApprovalsController(
    IApprovalService approvalService) : ApiControllerBase
{
    private bool CanApprove =>
        User.HasClaim(
            claim => claim.Type == "permission" &&
                     claim.Value is
                         "gatepass.approve.superior" or
                         "gatepass.approve.president" or
                         "gatepass.note.pas");

    [HttpGet("queue")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ApprovalQueueItem>>>> Queue(
        CancellationToken cancellationToken)
    {
        if (!CanApprove)
        {
            return Forbid();
        }

        return Success(await approvalService.GetQueueAsync(
            CurrentUserId,
            cancellationToken));
    }

    [HttpPost("{requestId:long}/approve")]
    public Task<ActionResult<ApiResponse<ApprovalDecisionResult>>> Approve(
        long requestId,
        [FromBody] ApprovalDecisionRequest request,
        CancellationToken cancellationToken) =>
        Decide(requestId, true, request, cancellationToken);

    [HttpPost("{requestId:long}/reject")]
    public Task<ActionResult<ApiResponse<ApprovalDecisionResult>>> Reject(
        long requestId,
        [FromBody] ApprovalDecisionRequest request,
        CancellationToken cancellationToken) =>
        Decide(requestId, false, request, cancellationToken);

    private async Task<ActionResult<ApiResponse<ApprovalDecisionResult>>> Decide(
        long requestId,
        bool approve,
        ApprovalDecisionRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanApprove)
        {
            return Forbid();
        }

        var result = await approvalService.DecideAsync(
            requestId,
            CurrentUserId,
            approve,
            request,
            HttpContext.TraceIdentifier,
            cancellationToken);
        return result.IsSuccess
            ? Success(
                result.Value!,
                approve ? "Gate pass approved." : "Gate pass rejected.")
            : ServiceFailure(result);
    }
}


