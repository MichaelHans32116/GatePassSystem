using GatePassSystem.Project.DTOs.Auth;

namespace GatePassSystem.Project.Services;

public interface IAuthService
{
    Task<LoginResult> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken = default);

    Task<AuthUserResponse?> GetCurrentUserAsync(
        long accountId,
        CancellationToken cancellationToken = default);
}
