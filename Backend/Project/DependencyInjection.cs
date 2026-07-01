using Dapper;
using FormRequestSystem.Project.Models;
using FormRequestSystem.Project.Repositories;
using FormRequestSystem.Project.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace FormRequestSystem.Project;

public static class DependencyInjection
{
    public static IServiceCollection AddGatePassProject(
        this IServiceCollection services,
        string connectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        DefaultTypeMap.MatchNamesWithUnderscores = true;

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IDatabaseConnectionFactory>(
            new MariaDbConnectionFactory(connectionString));

        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IDatabaseHealthRepository, DatabaseHealthRepository>();
        services.AddScoped<IEmployeeRepository, EmployeeRepository>();
        services.AddScoped<IGatePassRepository, GatePassRepository>();
        services.AddScoped<IApprovalRepository, ApprovalRepository>();
        services.AddScoped<IFleetRepository, FleetRepository>();
        services.AddScoped<ISecurityRepository, SecurityRepository>();
        services.AddScoped<ISignatureRepository, SignatureRepository>();
        services.AddScoped<IOperationsRepository, OperationsRepository>();
        services.AddScoped<IAdminRepository, AdminRepository>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddSingleton<IQrTokenService, QrTokenService>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IEmployeeService, EmployeeService>();
        services.AddScoped<IGatePassService, GatePassService>();
        services.AddScoped<IApprovalService, ApprovalService>();
        services.AddScoped<IFleetService, FleetService>();
        services.AddScoped<ISecurityService, SecurityService>();
        services.AddScoped<ISignatureService, SignatureService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<IAdminService, AdminService>();

        services.AddOptions<JwtOptions>();
        services.AddSingleton<IValidateOptions<JwtOptions>, JwtOptionsValidator>();

        return services;
    }
}

