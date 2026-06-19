using GatePassSystem.Project.DTOs.Fleet;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;

namespace GatePassSystem.Project.Services;

public sealed class FleetService(IFleetRepository repository) : IFleetService
{
    private static readonly HashSet<string> VehicleStatuses =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "AVAILABLE",
            "MAINTENANCE",
            "UNAVAILABLE"
        };

    private static readonly HashSet<string> DriverTypes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "EMPLOYEE",
            "EXTERNAL"
        };

    public Task<IReadOnlyList<VehicleRecord>> GetVehiclesAsync(
        CancellationToken cancellationToken = default) =>
        repository.GetVehiclesAsync(cancellationToken);

    public Task<IReadOnlyList<DriverRecord>> GetDriversAsync(
        CancellationToken cancellationToken = default) =>
        repository.GetDriversAsync(cancellationToken);

    public Task<long> SaveVehicleAsync(
        long? vehicleId,
        SaveVehicleRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.VehicleName) ||
            string.IsNullOrWhiteSpace(request.PlateNumber))
        {
            throw new InvalidOperationException(
                "Vehicle name and plate number are required.");
        }

        if (request.Capacity is <= 0)
        {
            throw new InvalidOperationException(
                "Vehicle capacity must be greater than zero.");
        }

        if (string.IsNullOrWhiteSpace(request.VehicleStatusCode) ||
            !VehicleStatuses.Contains(request.VehicleStatusCode.Trim()))
        {
            throw new InvalidOperationException("The selected vehicle status is invalid.");
        }

        return repository.SaveVehicleAsync(vehicleId, request, cancellationToken);
    }

    public Task<long> SaveDriverAsync(
        long? driverId,
        SaveDriverRequest request,
        CancellationToken cancellationToken = default)
    {
        var driverType = request.DriverTypeCode?.Trim();
        if (string.IsNullOrWhiteSpace(request.FullName))
        {
            throw new InvalidOperationException("Driver full name is required.");
        }

        if (string.IsNullOrWhiteSpace(driverType) ||
            !DriverTypes.Contains(driverType))
        {
            throw new InvalidOperationException("The selected driver type is invalid.");
        }

        if (driverType.Equals("EMPLOYEE", StringComparison.OrdinalIgnoreCase) &&
            !request.EmployeeRecordId.HasValue)
        {
            throw new InvalidOperationException(
                "An employee record is required for an employee driver.");
        }

        return repository.SaveDriverAsync(driverId, request, cancellationToken);
    }

    public Task ArchiveVehicleAsync(
        long vehicleId,
        CancellationToken cancellationToken = default) =>
        repository.ArchiveVehicleAsync(vehicleId, cancellationToken);

    public Task ArchiveDriverAsync(
        long driverId,
        CancellationToken cancellationToken = default) =>
        repository.ArchiveDriverAsync(driverId, cancellationToken);
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

    public Task<bool> CanReadAsync(
        long signatureFileId,
        long userId,
        CancellationToken cancellationToken = default) =>
        repository.CanUserReadAsync(
            signatureFileId,
            userId,
            cancellationToken);
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
