namespace GatePassSystem.Project.Models;

public sealed record TokenResult(string AccessToken, DateTimeOffset ExpiresAt);
