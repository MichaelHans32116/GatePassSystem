using System.Security.Claims;
using GatePassSystem.Api.Infrastructure;
using GatePassSystem.Project.DTOs.Common;
using Microsoft.AspNetCore.Mvc;

namespace GatePassSystem.Api.Controllers;

public abstract class ApiControllerBase : ControllerBase
{
    protected long CurrentUserId
    {
        get
        {
            var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return long.TryParse(claim, out var userId) ? userId : 0;
        }
    }

    protected bool HasPermission(string permission) =>
        User.HasClaim("permission", permission);

    protected ActionResult<ApiResponse<T>> Success<T>(
        T data,
        string? message = null) =>
        Ok(new ApiResponse<T>(
            data,
            message,
            HttpContext.TraceIdentifier));

    protected ActionResult<PagedApiResponse<T>> Paged<T>(
        PagedResult<T> result) =>
        Ok(new PagedApiResponse<T>(
            result.Items,
            result.Page,
            result.PageSize,
            result.TotalCount,
            result.PageSize == 0
                ? 0
                : (long)Math.Ceiling(
                    result.TotalCount / (double)result.PageSize),
            HttpContext.TraceIdentifier));

    protected ActionResult<ApiResponse<T>> ServiceFailure<T>(
        ServiceResult<T> result)
    {
        var status = result.ErrorCode switch
        {
            "REQUESTER_NOT_FOUND" => StatusCodes.Status404NotFound,
            "APPROVAL_NOT_AVAILABLE" => StatusCodes.Status409Conflict,
            "APPROVER_NOT_CONFIGURED" => StatusCodes.Status409Conflict,
            "VEHICLE_UNAVAILABLE" => StatusCodes.Status409Conflict,
            "REJECTION_REASON_REQUIRED" => StatusCodes.Status422UnprocessableEntity,
            "VALIDATION_ERROR" => StatusCodes.Status422UnprocessableEntity,
            "IDENTIFIER_REQUIRED" => StatusCodes.Status422UnprocessableEntity,
            "GATE_PASS_NOT_FOUND" => StatusCodes.Status404NotFound,
            "QR_NOT_AVAILABLE" => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };

        return StatusCode(status, new ApiErrorResponse(
            result.ErrorCode ?? "REQUEST_FAILED",
            result.ErrorMessage ?? "The request could not be completed.",
            null,
            HttpContext.TraceIdentifier));
    }
}
