using FormRequestSystem.Project.DTOs.Fleet;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

public interface IFleetRepository
{
    Task<IReadOnlyList<VehicleRecord>> GetVehiclesAsync(
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DriverRecord>> GetDriversAsync(
        CancellationToken cancellationToken = default);

    Task<long> SaveVehicleAsync(
        long? vehicleId,
        SaveVehicleRequest request,
        CancellationToken cancellationToken = default);

    Task<long> SaveDriverAsync(
        long? driverId,
        SaveDriverRequest request,
        CancellationToken cancellationToken = default);
    Task ArchiveVehicleAsync(
        long vehicleId,
        CancellationToken cancellationToken = default);
    Task ArchiveDriverAsync(
        long driverId,
        CancellationToken cancellationToken = default);

    Task<bool> ReserveAsync(
        long gatePassId,
        long vehicleId,
        long? driverId,
        DateTime reservedFrom,
        DateTime? reservedUntil,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<VehicleScheduleRecord>> GetScheduleAsync(
        DateTime from,
        DateTime to,
        CancellationToken cancellationToken = default);

    Task<long> SaveFixedScheduleAsync(
        long? id,
        SaveFixedScheduleRequest request,
        CancellationToken cancellationToken = default);

    Task DeleteFixedScheduleAsync(
        long id,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<FixedScheduleRecord>> GetFixedSchedulesAsync(
        CancellationToken cancellationToken = default);
}


