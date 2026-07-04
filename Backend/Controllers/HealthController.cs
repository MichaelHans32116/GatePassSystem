using FormRequestSystem.Project.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FormRequestSystem.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed class HealthController(
    IDatabaseHealthRepository databaseHealthRepository) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var databaseConnected =
            await databaseHealthRepository.CanConnectAsync(cancellationToken);

        return databaseConnected
            ? Ok(new
            {
                status = "Healthy",
                database = "Connected",
                timestamp = DateTimeOffset.UtcNow
            })
            : StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                status = "Degraded",
                database = "Unavailable",
                timestamp = DateTimeOffset.UtcNow
            });
    }
}

