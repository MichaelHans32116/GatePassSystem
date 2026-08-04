using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

public interface IUserRepository
{
    Task<IReadOnlyList<AuthUser>> FindForLoginAsync(
        string username,
        CancellationToken cancellationToken = default);

    Task<AuthUser?> GetCurrentUserAsync(
        long accountId,
        CancellationToken cancellationToken = default);

    Task UpdateLastLoginAsync(
        long accountId,
        DateTimeOffset loggedInAt,
        CancellationToken cancellationToken = default);

    Task<bool> ChangePasswordAsync(
        long accountId,
        string passwordHash,
        DateTimeOffset changedAt,
        CancellationToken cancellationToken = default);
}

