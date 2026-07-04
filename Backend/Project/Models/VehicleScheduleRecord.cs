namespace FormRequestSystem.Project.Models;

public sealed class VehicleScheduleRecord
{
    public long ScheduleId { get; init; }
    public string ScheduleSource { get; init; } = string.Empty; // 'RESERVATION' or 'FIXED'
    public long VehicleId { get; init; }
    public string VehicleName { get; init; } = string.Empty;
    public string PlateNumber { get; init; } = string.Empty;
    public string? VehicleType { get; init; }
    public long? DriverId { get; init; }
    public string? DriverName { get; init; }
    public DateTime ScheduleDate { get; init; }
    public TimeSpan StartTime { get; init; }
    public TimeSpan EndTime { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string StatusCode { get; init; } = string.Empty; // reservation status or 'FIXED'
    public string? RequesterName { get; init; }
    public string? Destination { get; init; }
    public long? GatePassId { get; init; }
    public string? ControlNo { get; init; }
}

