using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Services;

public interface IJwtTokenService
{
    TokenResult CreateToken(AuthUser user);
}
