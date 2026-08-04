using System.Data;
using Dapper;
using FormRequestSystem.Api.Infrastructure;
using FormRequestSystem.Api.Infrastructure.Authorization;
using FormRequestSystem.Project.DTOs.Fleet;
using FormRequestSystem.Project.Models;
using FormRequestSystem.Project.Repositories;
using FormRequestSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace FormRequestSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public sealed class FleetController(
    IFleetService fleetService,
    IDatabaseConnectionFactory connectionFactory,
    IMemoryCache cache) : ApiControllerBase
{
    // Vehicles and drivers are stable master lists hit by every calendar and
    // request-form load. They are cached briefly and invalidated on every
    // mutation in this controller (the only write path for both lists).
    private const string VehiclesCacheKey = "fleet:vehicles";
    private const string DriversCacheKey = "fleet:drivers";
    private static readonly TimeSpan MasterListCacheTtl = TimeSpan.FromMinutes(5);

    [AllowAnonymous]
    [HttpGet("vehicles")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<VehicleRecord>>>> Vehicles(
        CancellationToken cancellationToken)
    {
        if (!cache.TryGetValue(VehiclesCacheKey, out IReadOnlyList<VehicleRecord>? vehicles) ||
            vehicles is null)
        {
            vehicles = await fleetService.GetVehiclesAsync(cancellationToken);
            cache.Set(VehiclesCacheKey, vehicles, MasterListCacheTtl);
        }

        return Success(vehicles);
    }

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
        cache.Remove(VehiclesCacheKey);
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
        cache.Remove(VehiclesCacheKey);
        return Success<object>(new { id }, "Vehicle updated.");
    }

    [Authorize(Policy = GatePassPermissions.FleetManage)]
    [HttpDelete("vehicles/{id:long}")]
    public async Task<IActionResult> ArchiveVehicle(
        long id,
        CancellationToken cancellationToken)
    {
        await fleetService.ArchiveVehicleAsync(id, cancellationToken);
        cache.Remove(VehiclesCacheKey);
        return NoContent();
    }

    [AllowAnonymous]
    [HttpGet("drivers")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<DriverRecord>>>> Drivers(
        CancellationToken cancellationToken)
    {
        if (!cache.TryGetValue(DriversCacheKey, out IReadOnlyList<DriverRecord>? drivers) ||
            drivers is null)
        {
            drivers = await fleetService.GetDriversAsync(cancellationToken);
            cache.Set(DriversCacheKey, drivers, MasterListCacheTtl);
        }

        return Success(drivers);
    }

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
        cache.Remove(DriversCacheKey);
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
        cache.Remove(DriversCacheKey);
        return Success<object>(new { id }, "Driver updated.");
    }

    [Authorize(Policy = GatePassPermissions.FleetManage)]
    [HttpDelete("drivers/{id:long}")]
    public async Task<IActionResult> ArchiveDriver(
        long id,
        CancellationToken cancellationToken)
    {
        await fleetService.ArchiveDriverAsync(id, cancellationToken);
        cache.Remove(DriversCacheKey);
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

    [HttpGet("fleet/fixed-schedules")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<FixedScheduleRecord>>>> FixedSchedules(
        CancellationToken cancellationToken) =>
        Success(await fleetService.GetFixedSchedulesAsync(cancellationToken));

    [HttpPost("fleet/fixed-schedule")]
    public async Task<ActionResult<ApiResponse<object>>> CreateFixedSchedule(
        [FromBody] SaveFixedScheduleRequest request,
        CancellationToken cancellationToken)
    {
        var scope = await ResolveScheduleScopeAsync(cancellationToken);
        if (!scope.CanManageAll && !scope.CanManageTrucksOnly)
        {
            return Forbid();
        }

        // A truck-only manager (Logistics/PPC) may only touch TRUCK vehicles.
        if (!scope.CanManageAll &&
            !await IsTruckVehicleAsync(request.VehicleId, cancellationToken))
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
        var scope = await ResolveScheduleScopeAsync(cancellationToken);
        if (!scope.CanManageAll && !scope.CanManageTrucksOnly)
        {
            return Forbid();
        }

        // A truck-only manager may only edit an existing truck schedule and may not
        // repoint it to a non-truck vehicle.
        if (!scope.CanManageAll &&
            (!await IsTruckFixedScheduleAsync(id, cancellationToken) ||
             !await IsTruckVehicleAsync(request.VehicleId, cancellationToken)))
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
        var scope = await ResolveScheduleScopeAsync(cancellationToken);
        if (!scope.CanManageAll && !scope.CanManageTrucksOnly)
        {
            return Forbid();
        }

        if (!scope.CanManageAll &&
            !await IsTruckFixedScheduleAsync(id, cancellationToken))
        {
            return Forbid();
        }

        await fleetService.DeleteFixedScheduleAsync(id, cancellationToken);
        return NoContent();
    }

    // HRAD managers keep full access to every fixed schedule; a truck-only manager
    // (e.g. MUAMAR / Logistics-PPC) is granted the data-driven
    // 'fleet.truckschedule.manage' permission and is limited to TRUCK vehicles.
    private static readonly string[] HradScheduleManagers =
        { "GA120", "GA150", "GA133", "GA139", "GA409", "GA407" };

    private async Task<(bool CanManageAll, bool CanManageTrucksOnly)> ResolveScheduleScopeAsync(
        CancellationToken cancellationToken)
    {
        var username = User.FindFirst("username")?.Value;
        if (username is not null && Array.IndexOf(HradScheduleManagers, username) >= 0)
        {
            return (true, false);
        }

        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var hasTruckPermission = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            """
            SELECT COUNT(*)
            FROM tbl_user_roles ur
            JOIN tbl_roles r ON r.role_id = ur.role_id
            JOIN tbl_role_permissions rp ON rp.role_id = ur.role_id
            JOIN tbl_permissions p ON p.permission_id = rp.permission_id
            WHERE ur.user_id = @UserId
              AND ur.is_active = TRUE
              AND r.is_active = TRUE
              AND p.permission_code = 'fleet.truckschedule.manage';
            """,
            new { UserId = CurrentUserId },
            cancellationToken: cancellationToken));

        return (false, hasTruckPermission > 0);
    }

    private async Task<bool> IsTruckVehicleAsync(
        long vehicleId,
        CancellationToken cancellationToken)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var isTruck = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(*) FROM tbl_vehicles WHERE vehicle_id = @VehicleId AND UPPER(vehicle_type) = 'TRUCK';",
            new { VehicleId = vehicleId },
            cancellationToken: cancellationToken));
        return isTruck > 0;
    }

    private async Task<bool> IsTruckFixedScheduleAsync(
        long fixedScheduleId,
        CancellationToken cancellationToken)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var isTruck = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            """
            SELECT COUNT(*)
            FROM tbl_fixed_vehicle_schedules fs
            JOIN tbl_vehicles v ON v.vehicle_id = fs.vehicle_id
            WHERE fs.fixed_schedule_id = @Id AND UPPER(v.vehicle_type) = 'TRUCK';
            """,
            new { Id = fixedScheduleId },
            cancellationToken: cancellationToken));
        return isTruck > 0;
    }

}


