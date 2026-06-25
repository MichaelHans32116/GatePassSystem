using Dapper;
using GatePassSystem.Project.DTOs.Fleet;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public sealed class FleetRepository(
    IDatabaseConnectionFactory connectionFactory) : IFleetRepository
{
    public async Task<IReadOnlyList<VehicleRecord>> GetVehiclesAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var vehicles = await connection.QueryAsync<VehicleRecord>(
            new CommandDefinition(
                """
                SELECT
                    vehicle.vehicle_id AS VehicleId,
                    vehicle.vehicle_name AS VehicleName,
                    vehicle.plate_number AS PlateNumber,
                    vehicle.vehicle_type AS VehicleType,
                    vehicle.capacity AS Capacity,
                    vehicle.default_driver_id AS DefaultDriverId,
                    vehicle.vehicle_status_code AS VehicleStatusCode,
                    availability.availability_status_code AS AvailabilityStatusCode,
                    vehicle.remarks AS Remarks,
                    vehicle.is_active AS IsActive
                FROM tbl_vehicles vehicle
                JOIN view_vehicle_availability availability
                    ON availability.vehicle_id = vehicle.vehicle_id
                WHERE vehicle.is_active = TRUE
                ORDER BY vehicle.vehicle_name, vehicle.plate_number;
                """,
                cancellationToken: cancellationToken));
        return vehicles.AsList();
    }

    public async Task<IReadOnlyList<DriverRecord>> GetDriversAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var drivers = await connection.QueryAsync<DriverRecord>(
            new CommandDefinition(
                """
                SELECT
                    driver_id AS DriverId,
                    employee_record_id AS EmployeeRecordId,
                    full_name AS FullName,
                    driver_type_code AS DriverTypeCode,
                    license_number AS LicenseNumber,
                    license_expiry_date AS LicenseExpiryDate,
                    is_active AS IsActive
                FROM tbl_drivers
                WHERE is_active = TRUE
                ORDER BY full_name;
                """,
                cancellationToken: cancellationToken));
        return drivers.AsList();
    }

    public async Task<long> SaveVehicleAsync(
        long? vehicleId,
        SaveVehicleRequest request,
        CancellationToken cancellationToken = default)
    {
        var vehicleName = request.VehicleName.Trim();
        var plateNumber = request.PlateNumber.Trim().ToUpperInvariant();
        var vehicleStatusCode =
            request.VehicleStatusCode.Trim().ToUpperInvariant();
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        var duplicatePlate = await connection.ExecuteScalarAsync<bool>(
            new CommandDefinition(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM tbl_vehicles
                    WHERE plate_number = @PlateNumber
                      AND (@VehicleId IS NULL OR vehicle_id <> @VehicleId)
                );
                """,
                new { PlateNumber = plateNumber, VehicleId = vehicleId },
                cancellationToken: cancellationToken));
        if (duplicatePlate)
        {
            throw new InvalidOperationException(
                "That plate number is already assigned to another vehicle.");
        }

        if (request.DefaultDriverId.HasValue)
        {
            var driverExists = await connection.ExecuteScalarAsync<bool>(
                new CommandDefinition(
                    """
                    SELECT EXISTS (
                        SELECT 1
                        FROM tbl_drivers
                        WHERE driver_id = @DriverId
                          AND is_active = TRUE
                    );
                    """,
                    new { DriverId = request.DefaultDriverId.Value },
                    cancellationToken: cancellationToken));
            if (!driverExists)
            {
                throw new InvalidOperationException(
                    "The selected active driver was not found.");
            }
        }

        if (vehicleId.HasValue)
        {
            var affected = await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_vehicles
                SET vehicle_name = @VehicleName,
                    plate_number = @PlateNumber,
                    vehicle_type = @VehicleType,
                    capacity = @Capacity,
                    default_driver_id = @DefaultDriverId,
                    vehicle_status_code = @VehicleStatusCode,
                    remarks = @Remarks
                WHERE vehicle_id = @VehicleId
                  AND is_active = TRUE;
                """,
                new
                {
                    VehicleId = vehicleId.Value,
                    VehicleName = vehicleName,
                    PlateNumber = plateNumber,
                    request.VehicleType,
                    request.Capacity,
                    request.DefaultDriverId,
                    VehicleStatusCode = vehicleStatusCode,
                    request.Remarks
                },
                cancellationToken: cancellationToken));
            if (affected == 0)
            {
                throw new InvalidOperationException(
                    "Active vehicle record was not found.");
            }
            return vehicleId.Value;
        }

        return await connection.QuerySingleAsync<long>(new CommandDefinition(
            """
            INSERT INTO tbl_vehicles (
                vehicle_name,
                plate_number,
                vehicle_type,
                capacity,
                default_driver_id,
                vehicle_status_code,
                remarks
            ) VALUES (
                @VehicleName,
                @PlateNumber,
                @VehicleType,
                @Capacity,
                @DefaultDriverId,
                @VehicleStatusCode,
                @Remarks
            );
            SELECT LAST_INSERT_ID();
            """,
            new
            {
                VehicleName = vehicleName,
                PlateNumber = plateNumber,
                request.VehicleType,
                request.Capacity,
                request.DefaultDriverId,
                VehicleStatusCode = vehicleStatusCode,
                request.Remarks
            },
            cancellationToken: cancellationToken));
    }

    public async Task<long> SaveDriverAsync(
        long? driverId,
        SaveDriverRequest request,
        CancellationToken cancellationToken = default)
    {
        var driverTypeCode = request.DriverTypeCode.Trim().ToUpperInvariant();
        var employeeRecordId = driverTypeCode == "EMPLOYEE"
            ? request.EmployeeRecordId
            : null;
        var fullName = request.FullName.Trim();
        var licenseNumber = string.IsNullOrWhiteSpace(request.LicenseNumber)
            ? null
            : request.LicenseNumber.Trim().ToUpperInvariant();
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        if (employeeRecordId.HasValue)
        {
            var employeeExists = await connection.ExecuteScalarAsync<bool>(
                new CommandDefinition(
                    """
                    SELECT EXISTS (
                        SELECT 1
                        FROM tbl_employees
                        WHERE employee_record_id = @EmployeeRecordId
                          AND employment_status_code = 'ACTIVE'
                    );
                    """,
                    new { EmployeeRecordId = employeeRecordId.Value },
                    cancellationToken: cancellationToken));
            if (!employeeExists)
            {
                throw new InvalidOperationException(
                    "The selected active employee record was not found.");
            }

            var employeeAlreadyLinked = await connection.ExecuteScalarAsync<bool>(
                new CommandDefinition(
                    """
                    SELECT EXISTS (
                        SELECT 1
                        FROM tbl_drivers
                        WHERE employee_record_id = @EmployeeRecordId
                          AND (@DriverId IS NULL OR driver_id <> @DriverId)
                    );
                    """,
                    new
                    {
                        EmployeeRecordId = employeeRecordId.Value,
                        DriverId = driverId
                    },
                    cancellationToken: cancellationToken));
            if (employeeAlreadyLinked)
            {
                throw new InvalidOperationException(
                    "That employee already has a driver record.");
            }
        }

        if (driverId.HasValue)
        {
            var affected = await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_drivers
                SET employee_record_id = @EmployeeRecordId,
                    full_name = @FullName,
                    driver_type_code = @DriverTypeCode,
                    license_number = @LicenseNumber,
                    license_expiry_date = @LicenseExpiryDate
                WHERE driver_id = @DriverId
                  AND is_active = TRUE;
                """,
                new
                {
                    DriverId = driverId.Value,
                    EmployeeRecordId = employeeRecordId,
                    FullName = fullName,
                    DriverTypeCode = driverTypeCode,
                    LicenseNumber = licenseNumber,
                    request.LicenseExpiryDate
                },
                cancellationToken: cancellationToken));
            if (affected == 0)
            {
                throw new InvalidOperationException(
                    "Active driver record was not found.");
            }
            return driverId.Value;
        }

        return await connection.QuerySingleAsync<long>(new CommandDefinition(
            """
            INSERT INTO tbl_drivers (
                employee_record_id,
                full_name,
                driver_type_code,
                license_number,
                license_expiry_date
            ) VALUES (
                @EmployeeRecordId,
                @FullName,
                @DriverTypeCode,
                @LicenseNumber,
                @LicenseExpiryDate
            );
            SELECT LAST_INSERT_ID();
            """,
            new
            {
                EmployeeRecordId = employeeRecordId,
                FullName = fullName,
                DriverTypeCode = driverTypeCode,
                LicenseNumber = licenseNumber,
                request.LicenseExpiryDate
            },
            cancellationToken: cancellationToken));
    }

    public async Task ArchiveVehicleAsync(
        long vehicleId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE tbl_vehicles
            SET is_active = FALSE,
                vehicle_status_code = 'ARCHIVED'
            WHERE vehicle_id = @VehicleId
              AND is_active = TRUE;
            """,
            new { VehicleId = vehicleId },
            cancellationToken: cancellationToken));
        if (affected == 0)
        {
            throw new InvalidOperationException(
                "Active vehicle record was not found.");
        }
    }

    public async Task ArchiveDriverAsync(
        long driverId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var exists = await connection.ExecuteScalarAsync<bool>(
            new CommandDefinition(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM tbl_drivers
                    WHERE driver_id = @DriverId
                      AND is_active = TRUE
                );
                """,
                new { DriverId = driverId },
                cancellationToken: cancellationToken));
        if (!exists)
        {
            throw new InvalidOperationException(
                "Active driver record was not found.");
        }

        var assignedVehicles = await connection.ExecuteScalarAsync<long>(
            new CommandDefinition(
                """
                SELECT COUNT(*)
                FROM tbl_vehicles
                WHERE default_driver_id = @DriverId
                  AND is_active = TRUE;
                """,
                new { DriverId = driverId },
                cancellationToken: cancellationToken));
        if (assignedVehicles > 0)
        {
            throw new InvalidOperationException(
                "Driver cannot be archived while assigned to an active vehicle.");
        }
        await connection.ExecuteAsync(new CommandDefinition(
            "UPDATE tbl_drivers SET is_active = FALSE WHERE driver_id = @DriverId;",
            new { DriverId = driverId },
            cancellationToken: cancellationToken));
    }

    public async Task<bool> ReserveAsync(
        long gatePassId,
        long vehicleId,
        long? driverId,
        DateTime reservedFrom,
        DateTime? reservedUntil,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var selectable = await connection.QuerySingleOrDefaultAsync<bool?>(
                new CommandDefinition(
                    """
                    SELECT status_row.is_selectable
                    FROM tbl_vehicles vehicle
                    JOIN tbl_vehicle_statuses status_row
                        ON status_row.vehicle_status_code =
                           vehicle.vehicle_status_code
                    WHERE vehicle.vehicle_id = @VehicleId
                      AND vehicle.is_active = TRUE
                    FOR UPDATE;
                    """,
                    new { VehicleId = vehicleId },
                    transaction,
                    cancellationToken: cancellationToken));

            if (selectable != true)
            {
                await transaction.RollbackAsync(cancellationToken);
                return false;
            }

            var fixedConflicts = await connection.ExecuteScalarAsync<int>(
                new CommandDefinition(
                    """
                    SELECT COUNT(*)
                    FROM tbl_fixed_vehicle_schedules fs
                    WHERE fs.vehicle_id = @VehicleId
                      AND fs.is_active = TRUE
                      AND fs.day_of_week = DAYOFWEEK(@ReservedFrom) - 1
                      AND fs.start_time < CAST(COALESCE(@ReservedUntil, '23:59:59') AS TIME)
                      AND fs.end_time > CAST(@ReservedFrom AS TIME);
                    """,
                    new
                    {
                        VehicleId = vehicleId,
                        ReservedFrom = reservedFrom,
                        ReservedUntil = reservedUntil
                    },
                    transaction,
                    cancellationToken: cancellationToken));

            if (fixedConflicts > 0)
            {
                await transaction.RollbackAsync(cancellationToken);
                return false;
            }

            var conflicts = await connection.ExecuteScalarAsync<int>(
                new CommandDefinition(
                    """
                    SELECT COUNT(*)
                    FROM tbl_vehicle_reservations reservation
                    JOIN tbl_reservation_statuses status_row
                        ON status_row.reservation_status_code =
                           reservation.reservation_status_code
                    WHERE reservation.vehicle_id = @VehicleId
                      AND status_row.blocks_availability = TRUE
                      AND reservation.reserved_from <
                          COALESCE(@ReservedUntil, '9999-12-31 23:59:59')
                      AND COALESCE(
                          reservation.reserved_until,
                          '9999-12-31 23:59:59'
                      ) > @ReservedFrom;
                    """,
                    new
                    {
                        VehicleId = vehicleId,
                        ReservedFrom = reservedFrom,
                        ReservedUntil = reservedUntil
                    },
                    transaction,
                    cancellationToken: cancellationToken));

            if (conflicts > 0)
            {
                await transaction.RollbackAsync(cancellationToken);
                return false;
            }

            await connection.ExecuteAsync(new CommandDefinition(
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
                    'PENDING'
                );
                """,
                new
                {
                    GatePassId = gatePassId,
                    VehicleId = vehicleId,
                    DriverId = driverId,
                    ReservedFrom = reservedFrom,
                    ReservedUntil = reservedUntil
                },
                transaction,
                cancellationToken: cancellationToken));

            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<IReadOnlyList<VehicleScheduleRecord>> GetScheduleAsync(
        DateTime from,
        DateTime to,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var schedules = await connection.QueryAsync<VehicleScheduleRecord>(
            new CommandDefinition(
                """
                SELECT
                    reservation.reservation_id AS ScheduleId,
                    'RESERVATION' AS ScheduleSource,
                    vehicle.vehicle_id AS VehicleId,
                    vehicle.vehicle_name AS VehicleName,
                    vehicle.plate_number AS PlateNumber,
                    vehicle.vehicle_type AS VehicleType,
                    reservation.driver_id AS DriverId,
                    driver.full_name AS DriverName,
                    DATE(reservation.reserved_from) AS ScheduleDate,
                    TIME(reservation.reserved_from) AS StartTime,
                    TIME(COALESCE(reservation.reserved_until,
                         ADDTIME(reservation.reserved_from, '01:00:00'))) AS EndTime,
                    CONCAT(
                        requester.full_name,
                        COALESCE(CONCAT(' - ', gpr.destination), '')
                    ) AS Title,
                    gpr.purpose AS Description,
                    reservation.reservation_status_code AS StatusCode,
                    requester.full_name AS RequesterName,
                    gpr.destination AS Destination,
                    gpr.gate_pass_id AS GatePassId,
                    gpr.control_no AS ControlNo
                FROM tbl_vehicle_reservations reservation
                JOIN tbl_vehicles vehicle
                    ON vehicle.vehicle_id = reservation.vehicle_id
                LEFT JOIN tbl_drivers driver
                    ON driver.driver_id = reservation.driver_id
                JOIN tbl_gate_pass_requests gpr
                    ON gpr.gate_pass_id = reservation.gate_pass_id
                JOIN tbl_employees requester
                    ON requester.employee_record_id = gpr.requester_employee_id
                WHERE reservation.reservation_status_code NOT IN
                      ('CANCELLED', 'REJECTED', 'EXPIRED')
                  AND DATE(reservation.reserved_from) >= @From
                  AND DATE(reservation.reserved_from) <= @To

                UNION ALL

                SELECT
                    fs.fixed_schedule_id AS ScheduleId,
                    'FIXED' AS ScheduleSource,
                    vehicle.vehicle_id AS VehicleId,
                    vehicle.vehicle_name AS VehicleName,
                    vehicle.plate_number AS PlateNumber,
                    vehicle.vehicle_type AS VehicleType,
                    fs.driver_id AS DriverId,
                    driver.full_name AS DriverName,
                    dates.dt AS ScheduleDate,
                    fs.start_time AS StartTime,
                    fs.end_time AS EndTime,
                    fs.title AS Title,
                    fs.description AS Description,
                    'FIXED' AS StatusCode,
                    NULL AS RequesterName,
                    NULL AS Destination,
                    NULL AS GatePassId,
                    NULL AS ControlNo
                FROM (
                    WITH RECURSIVE date_range AS (
                        SELECT DATE(@From) AS dt
                        UNION ALL
                        SELECT dt + INTERVAL 1 DAY
                        FROM date_range
                        WHERE dt < DATE(@To)
                    )
                    SELECT dt FROM date_range
                ) dates
                JOIN tbl_fixed_vehicle_schedules fs
                    ON fs.day_of_week = DAYOFWEEK(dates.dt) - 1
                   AND fs.is_active = TRUE
                JOIN tbl_vehicles vehicle
                    ON vehicle.vehicle_id = fs.vehicle_id
                   AND vehicle.is_active = TRUE
                LEFT JOIN tbl_drivers driver
                    ON driver.driver_id = fs.driver_id

                ORDER BY ScheduleDate, StartTime, VehicleName;
                """,
                new { From = from, To = to },
                cancellationToken: cancellationToken));
        return schedules.AsList();
    }
}

