using System.Data;
using Dapper;
using GatePassSystem.Api.Infrastructure;
using GatePassSystem.Api.Infrastructure.Authorization;
using GatePassSystem.Project.DTOs.Fleet;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;
using GatePassSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GatePassSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public sealed class FleetController(
    IFleetService fleetService,
    IDatabaseConnectionFactory connectionFactory,
    ILogger<FleetController> logger) : ApiControllerBase
{
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
        var username = User.FindFirst("username")?.Value;
        if (username != "GA120" && username != "GA150" && username != "GA133" && username != "GA139" && username != "GA409" && username != "GA407")
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
        if (username != "GA120" && username != "GA150" && username != "GA133" && username != "GA139" && username != "GA409" && username != "GA407")
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
        if (username != "GA120" && username != "GA150" && username != "GA133" && username != "GA139" && username != "GA409" && username != "GA407")
        {
            return Forbid();
        }

        await fleetService.DeleteFixedScheduleAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpPost("fleet/service-request")]
    public async Task<ActionResult<ApiResponse<object>>> CreateServiceRequest(
        [FromBody] CreateServiceRequestDto request,
        CancellationToken cancellationToken)
    {
        var username = User.FindFirst("username")?.Value;
        if (username != "GA125" && username != "GA407")
        {
            return Forbid();
        }

        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            // 1. Fetch requester employee context
            var requester = await connection.QuerySingleOrDefaultAsync<(long EmployeeRecordId, long DepartmentId, long PositionId)>(
                new CommandDefinition(
                    """
                    SELECT 
                        e.employee_record_id AS EmployeeRecordId, 
                        e.department_id AS DepartmentId, 
                        e.position_id AS PositionId
                    FROM tbl_user_accounts ua
                    JOIN tbl_employees e ON e.employee_record_id = ua.employee_record_id
                    WHERE ua.user_id = @UserId
                    """,
                    new { UserId = CurrentUserId },
                    transaction,
                    cancellationToken: cancellationToken));

            if (requester.EmployeeRecordId == 0)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest("Requester employee record not found.");
            }

            // 2. Parse expected times
            if (!DateOnly.TryParse(request.Date, out var parsedDate)
                || !TimeOnly.TryParse(request.StartTime, out var parsedStartTime)
                || !TimeOnly.TryParse(request.EndTime, out var parsedEndTime))
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest("Invalid date or time format in service request.");
            }

            var expectedOutAt = DateTime.SpecifyKind(parsedDate.ToDateTime(parsedStartTime), DateTimeKind.Utc);
            var expectedInAt = DateTime.SpecifyKind(parsedDate.ToDateTime(parsedEndTime), DateTimeKind.Utc);

            // 3. Create Gate Pass Request via SP
            var gatePassRaw = await connection.QuerySingleAsync<dynamic>(
                new CommandDefinition(
                    "SP_CreateGatePass",
                    new
                    {
                        p_requester_user_id = CurrentUserId,
                        p_requester_employee_id = requester.EmployeeRecordId,
                        p_requester_department_id = requester.DepartmentId,
                        p_requester_position_id = requester.PositionId,
                        p_prepared_by_signature_file_id = (long?)null,
                        p_destination = request.Destination,
                        p_purpose = request.Purpose,
                        p_expected_out_at = expectedOutAt,
                        p_expected_in_at = expectedInAt,
                        p_will_return = true,
                        p_vehicle_usage_code = "COMPANY",
                        p_vehicle_id = request.VehicleId,
                        p_private_vehicle_details = (string?)null,
                        p_driver_id = request.DriverId,
                        p_requires_superior_approval = false,
                        p_requires_president_approval = false,
                        p_trace_id = HttpContext.TraceIdentifier
                    },
                    commandType: CommandType.StoredProcedure,
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            // Stored procedure returns gate_pass_id as first column
            IDictionary<string, object> row = gatePassRaw;
            long gatePassId = Convert.ToInt64(row["gate_pass_id"]);

            // 4. Update gate pass request to 'APPROVED' state directly
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE tbl_gate_pass_requests
                    SET gate_pass_status_code = 'APPROVED',
                        approved_at = NOW(),
                        applied_at = NOW(),
                        approval_completed_at = NOW()
                    WHERE gate_pass_id = @GatePassId;
                    """,
                    new { GatePassId = gatePassId },
                    transaction,
                    cancellationToken: cancellationToken));

            // 5. Create vehicle reservation in 'RESERVED' state
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    INSERT INTO tbl_vehicle_reservations (
                        gate_pass_id,
                        vehicle_id,
                        driver_id,
                        reserved_from,
                        reserved_until,
                        reservation_status_code
                    ) VALUES (
                        @GatePassId,
                        @VehicleId,
                        @DriverId,
                        @ReservedFrom,
                        @ReservedUntil,
                        'RESERVED'
                    );
                    """,
                    new
                    {
                        GatePassId = gatePassId,
                        VehicleId = request.VehicleId,
                        DriverId = request.DriverId,
                        ReservedFrom = expectedOutAt,
                        ReservedUntil = expectedInAt
                    },
                    transaction,
                    cancellationToken: cancellationToken));

            // 6. Notify HR team: Joy (GA120), Luz (GA150), Babes (GA133), Alona (GA409)
            var hrUserIds = (await connection.QueryAsync<long>(
                new CommandDefinition(
                    "SELECT user_id FROM tbl_user_accounts WHERE username IN ('GA120', 'GA150', 'GA133', 'GA409');",
                    transaction: transaction,
                    cancellationToken: cancellationToken))).ToList();

            var presidentName = User.FindFirst("name")?.Value ?? "President";
            foreach (var hrUserId in hrUserIds)
            {
                await connection.ExecuteAsync(
                    new CommandDefinition(
                        """
                        INSERT INTO tbl_notifications (
                            user_id,
                            title,
                            message,
                            notification_type_code,
                            related_entity_type,
                            related_entity_id,
                            is_read
                        ) VALUES (
                            @UserId,
                            'President Service Vehicle Booked',
                            @Message,
                            'SYSTEM_INFO',
                            'GATE_PASS',
                            @GatePassId,
                            0
                        );
                        """,
                        new
                        {
                            UserId = hrUserId,
                            Message = $"{presidentName} reserved a service vehicle for {request.Date} {request.StartTime}-{request.EndTime} to {request.Destination}.",
                            GatePassId = gatePassId
                        },
                        transaction,
                        cancellationToken: cancellationToken));
            }

            await transaction.CommitAsync(cancellationToken);
            return Success<object>(new { gatePassId }, "Service request created and auto-approved.");
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            logger.LogError(ex, "Failed to create service request for user {UserId}.", CurrentUserId);
            return StatusCode(500, new { message = "Failed to create service request." });
        }
    }
}

public sealed record CreateServiceRequestDto(
    string Date,
    string StartTime,
    string EndTime,
    string Destination,
    string Purpose,
    long VehicleId,
    long DriverId);

