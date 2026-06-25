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
        return CreateSignedToken($"GP1.{gatePassId}");
    }

    public string CreateEmployeeToken(long employeeRecordId)
    {
        return CreateSignedToken($"EMP1.{employeeRecordId}");
    }

    public bool TryGetEmployeeRecordId(
        string token,
        out long employeeRecordId)
    {
        employeeRecordId = 0;
        var parts = token.Split('.');
        if (parts.Length != 3 ||
            !parts[0].Equals("EMP1", StringComparison.Ordinal) ||
            !long.TryParse(parts[1], out employeeRecordId) ||
            employeeRecordId <= 0)
        {
            return false;
        }

        var expected = CreateSignedToken($"EMP1.{employeeRecordId}");
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(token));
    }

    private string CreateSignedToken(string payload)
    {
        using var hmac = new HMACSHA256(_key);
        var signature = Base64UrlEncoder.Encode(
            hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
        return $"{payload}.{signature}";
    }

    public string HashToken(string token) =>
        Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

