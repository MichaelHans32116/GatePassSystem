namespace GatePassSystem.Project.Services;

public interface IQrTokenService
{
    string CreateToken(long gatePassId);
    string HashToken(string token);
}

