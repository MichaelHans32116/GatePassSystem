using GatePassSystem.Api.Infrastructure;
using GatePassSystem.Api.Infrastructure.Authorization;
using GatePassSystem.Project.DTOs.Fleet;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GatePassSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public sealed class FleetController(
    IFleetService fleetService) : ApiControllerBase
{
    [AllowAnonymous]
    [HttpGet("vehicles")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<VehicleRecord>>>> Vehicles(
        CancellationToken cancellationToken) =>
        Success(await fleetService.GetVehiclesAsync(cancellationToken));

    [Authorize(Policy = GatePassPermissions.FleetManage)]
    [HttpPost("vehicles")]
    public async Task<ActionResult<ApiResponse<object>>> CreateVehicle(
        [FromBody] SaveVehicleRequest request,
        CancellationToken cancellationToken)
    {
        var id = await fleetService.SaveVehicleAsync(
            null,
            request,
            cancellationToken);
        return CreatedAtAction(
            nameof(Vehicles),
            new ApiResponse<object>(
                new { id },
                "Vehicle created.",
                HttpContext.TraceIdentifier));
    }

    [Authorize(Policy = GatePassPermissions.FleetManage)]
    [HttpPut("vehicles/{id:long}")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateVehicle(
        long id,
        [FromBody] SaveVehicleRequest request,
        CancellationToken cancellationToken)
    {
        await fleetService.SaveVehicleAsync(id, request, cancellationToken);
        return Success<object>(new { id }, "Vehicle updated.");
    }

    [Authorize(Policy = GatePassPermissions.FleetManage)]
    [HttpDelete("vehicles/{id:long}")]
    public async Task<IActionResult> ArchiveVehicle(
        long id,
        CancellationToken cancellationToken)
    {
        await fleetService.ArchiveVehicleAsync(id, cancellationToken);
        return NoContent();
    }

    [AllowAnonymous]
    [HttpGet("drivers")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<DriverRecord>>>> Drivers(
        CancellationToken cancellationToken) =>
        Success(await fleetService.GetDriversAsync(cancellationToken));

    [Authorize(Policy = GatePassPermissions.FleetManage)]
    [HttpPost("drivers")]
    public async Task<ActionResult<ApiResponse<object>>> CreateDriver(
        [FromBody] SaveDriverRequest request,
        CancellationToken cancellationToken)
    {
        var id = await fleetService.SaveDriverAsync(
            null,
            request,
            cancellationToken);
        return CreatedAtAction(
            nameof(Drivers),
            new ApiResponse<object>(
                new { id },
                "Driver created.",
                HttpContext.TraceIdentifier));
    }

    [Authorize(Policy = GatePassPermissions.FleetManage)]
    [HttpPut("drivers/{id:long}")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateDriver(
        long id,
        [FromBody] SaveDriverRequest request,
        CancellationToken cancellationToken)
    {
        await fleetService.SaveDriverAsync(id, request, cancellationToken);
        return Success<object>(new { id }, "Driver updated.");
    }

    [Authorize(Policy = GatePassPermissions.FleetManage)]
    [HttpDelete("drivers/{id:long}")]
    public async Task<IActionResult> ArchiveDriver(
        long id,
        CancellationToken cancellationToken)
    {
        await fleetService.ArchiveDriverAsync(id, cancellationToken);
        return NoContent();
    }

    [AllowAnonymous]
    [HttpGet("fleet/schedule")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<VehicleScheduleRecord>>>> Schedule(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken cancellationToken)
    {
        var fromDate = from ?? DateTime.UtcNow.Date;
        var toDate = to ?? fromDate.AddDays(42); // ~6 weeks
        return Success(await fleetService.GetScheduleAsync(fromDate, toDate, cancellationToken));
    }

    [AllowAnonymous]
    [HttpGet("fleet/fixed-schedules")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<FixedScheduleRecord>>>> FixedSchedules(
        CancellationToken cancellationToken) =>
        Success(await fleetService.GetFixedSchedulesAsync(cancellationToken));

    [HttpPost("fleet/fixed-schedule")]
    public async Task<ActionResult<ApiResponse<object>>> CreateFixedSchedule(
        [FromBody] SaveFixedScheduleRequest request,
        CancellationToken cancellationToken)
    {
        var username = User.FindFirst("username")?.Value;
        if (username != "GA120" && username != "GA150" && username != "GA133" && username != "GA407")
        {
            return Forbid();
        }

        var id = await fleetService.SaveFixedScheduleAsync(null, request, cancellationToken);
        return Success<object>(new { id }, "Fixed schedule created.");
    }

    [HttpPut("fleet/fixed-schedule/{id:long}")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateFixedSchedule(
        long id,
        [FromBody] SaveFixedScheduleRequest request,
        CancellationToken cancellationToken)
    {
        var username = User.FindFirst("username")?.Value;
        if (username != "GA120" && username != "GA150" && username != "GA133" && username != "GA407")
        {
            return Forbid();
        }

        await fleetService.SaveFixedScheduleAsync(id, request, cancellationToken);
        return Success<object>(new { id }, "Fixed schedule updated.");
    }

    [HttpDelete("fleet/fixed-schedule/{id:long}")]
    public async Task<IActionResult> DeleteFixedSchedule(
        long id,
        CancellationToken cancellationToken)
    {
        var username = User.FindFirst("username")?.Value;
        if (username != "GA120" && username != "GA150" && username != "GA133" && username != "GA407")
        {
            return Forbid();
        }

        await fleetService.DeleteFixedScheduleAsync(id, cancellationToken);
        return NoContent();
    }
}

