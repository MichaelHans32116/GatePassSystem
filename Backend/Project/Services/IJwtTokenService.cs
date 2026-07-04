using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Services;

public interface IJwtTokenService
{
    TokenResult CreateToken(AuthUser user);
}

