using System.Security.Cryptography;
using System.Text;
using GatePassSystem.Project.Models;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace GatePassSystem.Project.Services;

public sealed class QrTokenService(IOptions<JwtOptions> options) : IQrTokenService
{
    private readonly byte[] _key = Encoding.UTF8.GetBytes(options.Value.Key);

    public string CreateToken(long gatePassId)
    {
        var payload = $"GP1.{gatePassId}";
        using var hmac = new HMACSHA256(_key);
        var signature = Base64UrlEncoder.Encode(
            hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
        return $"{payload}.{signature}";
    }

    public string HashToken(string token) =>
        Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

