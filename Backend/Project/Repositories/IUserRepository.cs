using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public interface IUserRepository
{
    Task<AuthUser?> FindForLoginAsync(
        string username,
        CancellationToken cancellationToken = default);

    Task<AuthUser?> GetCurrentUserAsync(
        long accountId,
        CancellationToken cancellationToken = default);

    Task UpdateLastLoginAsync(
        long accountId,
        DateTimeOffset loggedInAt,
        CancellationToken cancellationToken = default);
}
