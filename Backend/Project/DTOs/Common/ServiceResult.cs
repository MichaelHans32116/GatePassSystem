namespace GatePassSystem.Project.DTOs.Common;

public sealed record ServiceResult<T>(
    bool IsSuccess,
    T? Value,
    string? ErrorCode,
    string? ErrorMessage)
{
    public static ServiceResult<T> Success(T value) =>
        new(true, value, null, null);

    public static ServiceResult<T> Failure(string code, string message) =>
        new(false, default, code, message);
}

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    long TotalCount,
    int Page,
    int PageSize);

