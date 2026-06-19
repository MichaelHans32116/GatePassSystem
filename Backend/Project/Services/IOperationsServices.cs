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
}

public interface IDashboardService
{
    Task<DashboardSnapshot> GetAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        long? departmentId,
        CancellationToken cancellationToken = default);
}

