using FormRequestSystem.Project.DTOs.Auth;

namespace FormRequestSystem.Project.Services;

public interface IAuthService
{
    Task<LoginResult> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken = default);

    Task<AuthUserResponse?> GetCurrentUserAsync(
        long accountId,
        CancellationToken cancellationToken = default);
}

