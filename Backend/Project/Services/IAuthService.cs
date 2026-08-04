using FormRequestSystem.Project.DTOs.Auth;
using FormRequestSystem.Project.DTOs.Common;

namespace FormRequestSystem.Project.Services;

public interface IAuthService
{
    Task<LoginResult> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken = default);

    Task<AuthUserResponse?> GetCurrentUserAsync(
        long accountId,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<bool>> ChangePasswordAsync(
        long accountId,
        ChangePasswordRequest request,
        CancellationToken cancellationToken = default);
}
