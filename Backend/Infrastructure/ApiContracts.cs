namespace GatePassSystem.Api.Infrastructure;

public sealed record ApiResponse<T>(
    T Data,
    string? Message,
    string TraceId);

public sealed record ApiErrorResponse(
    string Code,
    string Message,
    object? Errors,
    string TraceId);

public sealed record PagedApiResponse<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    long TotalCount,
    long TotalPages,
    string TraceId);

