using System.Text;
using System.Threading.RateLimiting;
using FormRequestSystem.Api.Infrastructure;
using FormRequestSystem.Api.Infrastructure.Authorization;
using FormRequestSystem.Project;
using FormRequestSystem.Project.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using MySqlConnector;

const string FrontendCorsPolicy = "FrontendCors";
const string GeneralRateLimitPolicy = "General";
const string AuthRateLimitPolicy = "Auth";

var builder = WebApplication.CreateBuilder(args);

// Keep API logging portable for local Kestrel, Apache reverse proxy, and
// restricted Windows service accounts. The default Windows Event Log provider
// can terminate startup when the process account cannot create/write a source.
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

var environmentConnectionString =
    Environment.GetEnvironmentVariable("GATEPASS_DB_CONNECTION");

if (!builder.Environment.IsDevelopment() &&
    string.IsNullOrWhiteSpace(environmentConnectionString))
{
    throw new InvalidOperationException(
        "GATEPASS_DB_CONNECTION must be configured outside Development.");
}

var connectionString =
    environmentConnectionString
    ?? builder.Configuration.GetConnectionString("GatePassDatabase")
    ?? throw new InvalidOperationException("GatePassDatabase connection string is not configured.");

builder.Services
    .AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
    .ValidateOnStart();

builder.Services.AddGatePassProject(connectionString);
builder.Services
    .AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
            new BadRequestObjectResult(new ApiErrorResponse(
                "INVALID_REQUEST",
                "One or more request fields are invalid.",
                context.ModelState
                    .Where(entry => entry.Value?.Errors.Count > 0)
                    .ToDictionary(
                        entry => entry.Key,
                        entry => entry.Value!.Errors
                            .Select(error => error.ErrorMessage)
                            .ToArray()),
                context.HttpContext.TraceIdentifier));
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition(
        "Bearer",
        new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "Enter the JWT access token."
        });
    options.AddSecurityRequirement(document =>
        new OpenApiSecurityRequirement
        {
            [new OpenApiSecuritySchemeReference("Bearer", document)] = []
        });
});
builder.Services.AddResponseCompression();
builder.Services.AddMemoryCache();
builder.Services.Configure<SignatureStorageOptions>(
    builder.Configuration.GetSection("SignatureStorage"));
builder.Services.AddSingleton<ISignatureStorage, SignatureStorage>();
builder.Services.AddHttpClient("SignatureBackgroundRemoval", client =>
{
    client.Timeout = TimeSpan.FromSeconds(45);
});

var defaultOrigins = new[]
{
    "http://localhost",
    "http://127.0.0.1",
    "http://192.168.9.7",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://192.168.9.7:5500",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://192.168.9.7:8080"
};

var configuredOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

var allowAnyFrontendOrigin =
    builder.Environment.IsDevelopment() &&
    builder.Configuration.GetValue<bool>("Cors:AllowAnyOrigin");

var allowedOrigins = defaultOrigins
    .Concat(configuredOrigins)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCorsPolicy, policy =>
    {
        if (allowAnyFrontendOrigin)
        {
            policy.AllowAnyOrigin();
        }
        else
        {
            policy.WithOrigins(allowedOrigins);
        }

        policy
            .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .WithHeaders("Authorization", "Content-Type", "Accept");
    });
});

var jwtOptions = builder.Configuration
    .GetSection(JwtOptions.SectionName)
    .Get<JwtOptions>() ?? new JwtOptions();

if (!builder.Environment.IsDevelopment() &&
    jwtOptions.Key.StartsWith("DEVELOPMENT-ONLY", StringComparison.Ordinal))
{
    throw new InvalidOperationException(
        "A production JWT key must be configured before deployment.");
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.SaveToken = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();
builder.Services.AddAuthorization(options =>
{
    foreach (var permission in GatePassPermissions.All)
    {
        options.AddPolicy(
            permission,
            policy => policy.Requirements.Add(
                new PermissionRequirement(permission)));
    }
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddFixedWindowLimiter(GeneralRateLimitPolicy, limiter =>
    {
        limiter.PermitLimit = 180;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });

    options.AddFixedWindowLimiter(AuthRateLimitPolicy, limiter =>
    {
        limiter.PermitLimit = 10;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetConcurrencyLimiter(
            "api",
            _ => new ConcurrencyLimiterOptions
            {
                PermitLimit = 80,
                QueueLimit = 20,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));
});

var app = builder.Build();

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        var logger = context.RequestServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger("GlobalExceptionHandler");

        var error = feature?.Error;
        var isExpectedConflict = error is InvalidOperationException ||
            error is MySqlException
            {
                Number: 1062 or 1452
            } ||
            error is MySqlException
            {
                SqlState: "45000"
            };

        if (isExpectedConflict)
        {
            logger.LogWarning(
                "API request conflict. message={Message} traceId={TraceId}",
                error?.Message,
                context.TraceIdentifier);
        }
        else
        {
            logger.LogError(
                error,
                "Unhandled API exception. traceId={TraceId}",
                context.TraceIdentifier);
        }

        var (status, code, message) = error switch
        {
            InvalidOperationException invalid =>
                (StatusCodes.Status409Conflict,
                 "WORKFLOW_CONFLICT",
                 invalid.Message),
            MySqlException { SqlState: "45000" } database =>
                (StatusCodes.Status409Conflict,
                 "DATABASE_WORKFLOW_CONFLICT",
                 database.Message),
            MySqlException { Number: 1062 } =>
                (StatusCodes.Status409Conflict,
                 "DUPLICATE_RECORD",
                 "A record with the same unique value already exists."),
            MySqlException { Number: 1452 } =>
                (StatusCodes.Status409Conflict,
                 "REFERENCE_NOT_FOUND",
                 "A selected related record does not exist or is no longer active."),
            _ =>
                (StatusCodes.Status500InternalServerError,
                 "INTERNAL_SERVER_ERROR",
                 "Internal server error.")
        };

        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new ApiErrorResponse(
            code,
            message,
            null,
            context.TraceIdentifier));
    });
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next();
});

app.UseResponseCompression();
app.UseCors(FrontendCorsPolicy);
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers().RequireRateLimiting(GeneralRateLimitPolicy);

app.Run();

public partial class Program;

