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
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        if (vehicleId.HasValue)
        {
            await connection.ExecuteAsync(new CommandDefinition(
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
                    request.VehicleName,
                    PlateNumber = request.PlateNumber.Trim().ToUpperInvariant(),
                    request.VehicleType,
                    request.Capacity,
                    request.DefaultDriverId,
                    request.VehicleStatusCode,
                    request.Remarks
                },
                cancellationToken: cancellationToken));
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
                request.VehicleName,
                PlateNumber = request.PlateNumber.Trim().ToUpperInvariant(),
                request.VehicleType,
                request.Capacity,
                request.DefaultDriverId,
                request.VehicleStatusCode,
                request.Remarks
            },
            cancellationToken: cancellationToken));
    }

    public async Task<long> SaveDriverAsync(
        long? driverId,
        SaveDriverRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        if (driverId.HasValue)
        {
            await connection.ExecuteAsync(new CommandDefinition(
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
                    request.EmployeeRecordId,
                    request.FullName,
                    request.DriverTypeCode,
                    request.LicenseNumber,
                    request.LicenseExpiryDate
                },
                cancellationToken: cancellationToken));
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
            request,
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
}

