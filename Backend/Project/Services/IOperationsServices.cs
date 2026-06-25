using GatePassSystem.Project.DTOs.Fleet;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Services;

public interface IFleetService
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
    Task ArchiveVehicleAsync(long vehicleId, CancellationToken cancellationToken = default);
    Task ArchiveDriverAsync(long driverId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<VehicleScheduleRecord>> GetScheduleAsync(
        DateTime from,
        DateTime to,
        CancellationToken cancellationToken = default);
    Task<long> SaveFixedScheduleAsync(
        long? id,
        SaveFixedScheduleRequest request,
        CancellationToken cancellationToken = default);
    Task DeleteFixedScheduleAsync(long id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<FixedScheduleRecord>> GetFixedSchedulesAsync(CancellationToken cancellationToken = default);
}

public interface ISignatureService
{
    Task<SignatureFileRecord> RegisterAsync(
        long ownerUserId,
        SignatureMetadataRequest request,
        CancellationToken cancellationToken = default);
    Task<SignatureFileRecord?> GetAsync(
        long signatureFileId,
        CancellationToken cancellationToken = default);
    Task<bool> CanReadAsync(
        long signatureFileId,
        long userId,
        CancellationToken cancellationToken = default);
}

public interface IDashboardService
{
    Task<DashboardSnapshot> GetAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        long? departmentId,
        CancellationToken cancellationToken = default);
}
