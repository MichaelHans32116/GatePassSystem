namespace FormRequestSystem.Project.Models;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "FormRequestSystem.Api";
    public string Audience { get; set; } = "FormRequestSystem.Clients";
    public string Key { get; set; } = string.Empty;
    public int LifetimeMinutes { get; set; } = 120;
}

