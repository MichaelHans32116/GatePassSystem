using GatePassSystem.Project.DTOs.Fleet;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

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
}

