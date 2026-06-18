namespace GatePassSystem.Project.DTOs.Auth;

public sealed class LoginResponse
{
    public string AccessToken { get; init; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; init; }
    public AuthUserResponse User { get; init; } = new();
}
