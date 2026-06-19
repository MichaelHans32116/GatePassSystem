using System.Security.Claims;
using GatePassSystem.Project.DTOs.Auth;
using GatePassSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GatePassSystem.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    IAuthService authService,
    ILogger<AuthController> logger) : ControllerBase
{
    [AllowAnonymous]
    [EnableRateLimiting("Auth")]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(
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

            return Ok(result.Response);
        }

        logger.LogWarning(
            "Login failed for username {Username}. code={ErrorCode} traceId={TraceId}",
            request.Username.Trim(),
            result.ErrorCode,
            HttpContext.TraceIdentifier);

        return result.ErrorCode == "ACCOUNT_DISABLED"
            ? StatusCode(StatusCodes.Status403Forbidden, new { message = "Account is disabled." })
            : Unauthorized(new { message = "Invalid username or password." });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<AuthUserResponse>> Me(CancellationToken cancellationToken)
    {
        var accountIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!long.TryParse(accountIdClaim, out var accountId))
        {
            return Unauthorized();
        }

        var user = await authService.GetCurrentUserAsync(accountId, cancellationToken);
        return user is null ? Unauthorized() : Ok(user);
    }
}
