using System.Text;
using System.Threading.RateLimiting;
using GatePassSystem.Project;
using GatePassSystem.Project.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;

const string FrontendCorsPolicy = "FrontendCors";
const string GeneralRateLimitPolicy = "General";
const string AuthRateLimitPolicy = "Auth";

var builder = WebApplication.CreateBuilder(args);
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
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddResponseCompression();

var defaultOrigins = new[]
{
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8080",
    "http://127.0.0.1:8080"
};

var configuredOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

var allowedOrigins = defaultOrigins
    .Concat(configuredOrigins)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCorsPolicy, policy =>
        policy
            .WithOrigins(allowedOrigins)
            .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .WithHeaders("Authorization", "Content-Type", "Accept"));
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

builder.Services.AddAuthorization();
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

        logger.LogError(
            feature?.Error,
            "Unhandled API exception. traceId={TraceId}",
            context.TraceIdentifier);

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new
        {
            error = "Internal server error.",
            traceId = context.TraceIdentifier
        });
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
