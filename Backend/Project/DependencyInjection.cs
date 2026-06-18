using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;
using GatePassSystem.Project.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace GatePassSystem.Project;

public static class DependencyInjection
{
    public static IServiceCollection AddGatePassProject(
        this IServiceCollection services,
        string connectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IDatabaseConnectionFactory>(
            new MariaDbConnectionFactory(connectionString));

        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IDatabaseHealthRepository, DatabaseHealthRepository>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<IAuthService, AuthService>();

        services.AddOptions<JwtOptions>();
        services.AddSingleton<IValidateOptions<JwtOptions>, JwtOptionsValidator>();

        return services;
    }
}
