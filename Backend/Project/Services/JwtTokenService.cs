using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FormRequestSystem.Project.Models;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormRequestSystem.Project.Services;

public sealed class JwtTokenService(
    IOptions<JwtOptions> options,
    TimeProvider timeProvider) : IJwtTokenService
{
    private readonly JwtOptions _options = options.Value;

    public TokenResult CreateToken(AuthUser user)
    {
        var now = timeProvider.GetUtcNow();
        var expiresAt = now.AddMinutes(Math.Clamp(_options.LifetimeMinutes, 15, 720));
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.AccountId.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, user.Username),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(ClaimTypes.NameIdentifier, user.AccountId.ToString()),
            new(ClaimTypes.Name, user.DisplayName),
            new("username", user.Username),
            new(
                "password_version",
                (user.LastPasswordChangeAt?.Ticks ?? 0L).ToString(
                    System.Globalization.CultureInfo.InvariantCulture))
        };

        if (!string.IsNullOrWhiteSpace(user.EmployeeId))
        {
            claims.Add(new Claim("employee_id", user.EmployeeId));
        }

        claims.AddRange(user.Roles.Select(role => new Claim(ClaimTypes.Role, role)));
        claims.AddRange(user.Permissions.Select(permission => new Claim("permission", permission)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key));
        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new TokenResult(
            new JwtSecurityTokenHandler().WriteToken(token),
            expiresAt);
    }
}

