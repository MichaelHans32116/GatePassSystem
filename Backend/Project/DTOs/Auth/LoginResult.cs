namespace FormRequestSystem.Project.DTOs.Auth;

public sealed record LoginResult(bool Succeeded, string ErrorCode, LoginResponse? Response)
{
    public static LoginResult Success(LoginResponse response) => new(true, string.Empty, response);
    public static LoginResult Failure(string errorCode) => new(false, errorCode, null);
}

