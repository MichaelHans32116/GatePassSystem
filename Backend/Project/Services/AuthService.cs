using FormRequestSystem.Project.DTOs.Auth;
using FormRequestSystem.Project.DTOs.Common;
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
        var candidates = await userRepository.FindForLoginAsync(username, cancellationToken);
        var user = candidates.FirstOrDefault(candidate =>
            passwordHasher.Verify(request.Password, candidate.PasswordHash));

        if (user is null)
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

    public async Task<ServiceResult<bool>> ChangePasswordAsync(
        long accountId,
        ChangePasswordRequest request,
        CancellationToken cancellationToken = default)
    {
        var currentPassword = request.CurrentPassword;
        var newPassword = request.NewPassword;
        var confirmPassword = request.ConfirmPassword;

        if (accountId <= 0 || string.IsNullOrWhiteSpace(currentPassword))
        {
            return ServiceResult<bool>.Failure(
                "CURRENT_PASSWORD_REQUIRED",
                "Current password is required.");
        }

        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length is < 8 or > 128)
        {
            return ServiceResult<bool>.Failure(
                "PASSWORD_LENGTH_INVALID",
                "New password must be 8 to 128 characters.");
        }

        if (!string.Equals(newPassword, confirmPassword, StringComparison.Ordinal))
        {
            return ServiceResult<bool>.Failure(
                "PASSWORD_CONFIRMATION_MISMATCH",
                "New password and confirmation do not match.");
        }

        var user = await userRepository.GetCurrentUserAsync(accountId, cancellationToken);
        if (user is null)
        {
            return ServiceResult<bool>.Failure(
                "ACCOUNT_NOT_FOUND",
                "The signed-in account is no longer available.");
        }

        if (!passwordHasher.Verify(currentPassword, user.PasswordHash))
        {
            return ServiceResult<bool>.Failure(
                "CURRENT_PASSWORD_INVALID",
                "Current password is incorrect.");
        }

        if (passwordHasher.Verify(newPassword, user.PasswordHash))
        {
            return ServiceResult<bool>.Failure(
                "PASSWORD_UNCHANGED",
                "New password must be different from the current password.");
        }

        var newHash = passwordHasher.Hash(newPassword);
        var saved = await userRepository.ChangePasswordAsync(
            accountId,
            newHash,
            timeProvider.GetUtcNow(),
            cancellationToken);

        return saved
            ? ServiceResult<bool>.Success(true)
            : ServiceResult<bool>.Failure(
                "PASSWORD_SAVE_FAILED",
                "Password was not saved. Please try again.");
    }

    private AuthUserResponse ToResponse(AuthUser user) =>
        AuthUserResponse.FromModel(
            user,
            user.EmployeeRecordId.HasValue
                ? qrTokenService.CreateEmployeeToken(user.EmployeeRecordId.Value)
                : null);
}
