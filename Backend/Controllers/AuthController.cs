using System.Security.Claims;
using FormRequestSystem.Api.Infrastructure;
using FormRequestSystem.Project.DTOs.Auth;
using FormRequestSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace FormRequestSystem.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    IAuthService authService,
    ILogger<AuthController> logger) : ApiControllerBase
{
    [AllowAnonymous]
    [EnableRateLimiting("Auth")]
    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<LoginResponse>>> Login(
        [FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authService.LoginAsync(request, cancellationToken);

        if (result.Succeeded)
        {
            logger.LogInformation(
                "Login succeeded for username {Username}. traceId={TraceId}",
                request.Username.Trim(),
                HttpContext.TraceIdentifier);

            return Success(result.Response!);
        }

        logger.LogWarning(
            "Login failed for username {Username}. code={ErrorCode} traceId={TraceId}",
            request.Username.Trim(),
            result.ErrorCode,
            HttpContext.TraceIdentifier);

        return result.ErrorCode == "ACCOUNT_DISABLED"
            ? StatusCode(
                StatusCodes.Status403Forbidden,
                new ApiErrorResponse(
                    "ACCOUNT_DISABLED",
                    "Account is disabled.",
                    null,
                    HttpContext.TraceIdentifier))
            : Unauthorized(new ApiErrorResponse(
                "INVALID_CREDENTIALS",
                "Invalid username or password.",
                null,
                HttpContext.TraceIdentifier));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<AuthUserResponse>>> Me(
        CancellationToken cancellationToken)
    {
        var accountIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!long.TryParse(accountIdClaim, out var accountId))
        {
            return Unauthorized();
        }

        var user = await authService.GetCurrentUserAsync(accountId, cancellationToken);
        return user is null ? Unauthorized() : Success(user);
    }

    [Authorize]
    [HttpPost("logout")]
    public IActionResult Logout() =>
        NoContent();
}

