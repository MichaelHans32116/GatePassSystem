namespace GatePassSystem.Project.Models;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "GatePassSystem.Api";
    public string Audience { get; set; } = "GatePassSystem.Clients";
    public string Key { get; set; } = string.Empty;
    public int LifetimeMinutes { get; set; } = 120;
}
