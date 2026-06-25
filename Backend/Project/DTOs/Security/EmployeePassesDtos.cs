namespace GatePassSystem.Project.DTOs.Security;

public sealed record EmployeePassItem(
    long GatePassId,
    string? GatePassNo,
    string? ControlNo,
    string FormTypeName,
    string? Destination,
    string StatusName,
    string StatusGroup,
    DateTime? DateFiled,
    DateTime? ExpectedOut,
    DateTime? CompletedAt,
    bool WillReturn);

public sealed record EmployeePassesResult(
    string EmployeeName,
    IReadOnlyList<EmployeePassItem> Active,
    IReadOnlyList<EmployeePassItem> Recent);
