using FormRequestSystem.Project.DTOs.Auth;
using FormRequestSystem.Project.Models;
using FormRequestSystem.Project.Repositories;

namespace FormRequestSystem.Project.Services;

public sealed class AuthService(
    IUserRepository userRepository,
    IPasswordHasher passwordHasher,
    IJwtTokenService jwtTokenService,
    IQrTokenService qrTokenService,
    TimeProvider timeProvider) : IAuthService
{
    public async Task<LoginResult> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken = default)
    {
        var username = request.Username.Trim();
        var user = await userRepository.FindForLoginAsync(username, cancellationToken);

        if (user is null || !passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            return LoginResult.Failure("INVALID_CREDENTIALS");
        }

        if (!user.AccountAllowsLogin)
        {
            return LoginResult.Failure("ACCOUNT_DISABLED");
        }

        var token = jwtTokenService.CreateToken(user);
        await userRepository.UpdateLastLoginAsync(
            user.AccountId,
            timeProvider.GetUtcNow(),
            cancellationToken);

        return LoginResult.Success(new LoginResponse
        {
            AccessToken = token.AccessToken,
            ExpiresAt = token.ExpiresAt,
            User = ToResponse(user)
        });
    }

    public async Task<AuthUserResponse?> GetCurrentUserAsync(
        long accountId,
        CancellationToken cancellationToken = default)
    {
        var user = await userRepository.GetCurrentUserAsync(accountId, cancellationToken);
        return user is null ? null : ToResponse(user);
    }

    private AuthUserResponse ToResponse(AuthUser user) =>
        AuthUserResponse.FromModel(
            user,
            user.EmployeeRecordId.HasValue
                ? qrTokenService.CreateEmployeeToken(user.EmployeeRecordId.Value)
                : null);
}

