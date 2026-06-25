namespace GatePassSystem.Project.DTOs.Fleet;

public sealed record SaveVehicleRequest(
    string VehicleName,
    string PlateNumber,
    string? VehicleType,
    int? Capacity,
    long? DefaultDriverId,
    string VehicleStatusCode,
    string? Remarks);

public sealed record SaveDriverRequest(
    long? EmployeeRecordId,
    string FullName,
    string DriverTypeCode,
    string? LicenseNumber,
    DateTime? LicenseExpiryDate);

public sealed record SignatureMetadataRequest(
    string FileName,
    string ContentType,
    string StoragePath,
    string ContentSha256,
    int? WidthPercent,
    int? YOffset);
