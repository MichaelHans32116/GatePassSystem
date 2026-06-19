using GatePassSystem.Project.DTOs.Fleet;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;

namespace GatePassSystem.Project.Services;

public sealed class FleetService(IFleetRepository repository) : IFleetService
{
    public Task<IReadOnlyList<VehicleRecord>> GetVehiclesAsync(
        CancellationToken cancellationToken = default) =>
        repository.GetVehiclesAsync(cancellationToken);

    public Task<IReadOnlyList<DriverRecord>> GetDriversAsync(
        CancellationToken cancellationToken = default) =>
        repository.GetDriversAsync(cancellationToken);

    public Task<long> SaveVehicleAsync(
        long? vehicleId,
        SaveVehicleRequest request,
        CancellationToken cancellationToken = default) =>
        repository.SaveVehicleAsync(vehicleId, request, cancellationToken);

    public Task<long> SaveDriverAsync(
        long? driverId,
        SaveDriverRequest request,
        CancellationToken cancellationToken = default) =>
        repository.SaveDriverAsync(driverId, request, cancellationToken);
}

public sealed class SignatureService(
    ISignatureRepository repository) : ISignatureService
{
    public Task<SignatureFileRecord> RegisterAsync(
        long ownerUserId,
        SignatureMetadataRequest request,
        CancellationToken cancellationToken = default) =>
        repository.CreateAsync(ownerUserId, request, cancellationToken);

    public Task<SignatureFileRecord?> GetAsync(
        long signatureFileId,
        CancellationToken cancellationToken = default) =>
        repository.GetAsync(signatureFileId, cancellationToken);
}

public sealed class DashboardService(
    IOperationsRepository repository) : IDashboardService
{
    public Task<DashboardSnapshot> GetAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        long? departmentId,
        CancellationToken cancellationToken = default) =>
        repository.GetDashboardAsync(
            from?.UtcDateTime,
            to?.UtcDateTime,
            departmentId,
            cancellationToken);
}
