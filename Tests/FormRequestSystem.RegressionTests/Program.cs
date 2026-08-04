using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using FormRequestSystem.Project.DTOs.Auth;
using FormRequestSystem.Project.DTOs.GatePass;
using FormRequestSystem.Project.Models;
using FormRequestSystem.Project.Repositories;
using FormRequestSystem.Project.Services;
using Microsoft.Extensions.Options;

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

var outsideCompanion = JsonSerializer.Deserialize<AssociateRequest>(
    """{"isEmployee":false,"employeeId":null,"fullName":"VISITOR SAMPLE"}""",
    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
Assert(outsideCompanion is { IsEmployee: false, EmployeeId: null, FullName: "VISITOR SAMPLE" },
    "Outside-companion JSON must preserve fullName with a null employeeId.");

var approvalRepository = new FakeApprovalRepository
{
    Context = new ApprovalDecisionContext
    {
        GatePassId = 10,
        FormTypeCode = "PERSON_GATE_PASS",
        WillReturn = true,
        VehicleUsageCode = "COMPANY",
        VehicleTripTypeCode = "BOTH",
        ApprovalStepCode = "HRAD_ASSIGN"
    }
};
var approvalService = new ApprovalService(
    approvalRepository,
    new FakeOperationsRepository(),
    new FakeQrTokenService(),
    TimeProvider.System);

var missingVehicle = await approvalService.DecideAsync(
    10,
    20,
    true,
    new ApprovalDecisionRequest(null, null),
    "test-missing-vehicle");
Assert(!missingVehicle.IsSuccess && missingVehicle.ErrorCode == "VEHICLE_REQUIRED" &&
       approvalRepository.DecideCount == 0,
    "HRAD approval must not advance without a company vehicle.");

var primaryOut = new DateTimeOffset(2026, 8, 4, 10, 0, 0, TimeSpan.FromHours(8));
var primaryIn = primaryOut.AddHours(1);
var secondaryOut = primaryOut.AddHours(3);
var secondaryIn = secondaryOut.AddHours(1);
var authoritativeContext = await approvalService.DecideAsync(
    10,
    20,
    true,
    new ApprovalDecisionRequest(
        null,
        null,
        VehicleId: 3,
        DriverId: 4,
        FormTypeCode: "MATERIAL_GATE_PASS",
        WillReturn: false,
        TripType: "HATID",
        ExpectedOutAt: primaryOut,
        ExpectedInAt: primaryIn,
        SecondaryExpectedOutAt: secondaryOut,
        SecondaryExpectedInAt: secondaryIn),
    "test-authoritative-context");
Assert(authoritativeContext.IsSuccess && approvalRepository.LastTripType == "BOTH",
    "Stored request context and stored trip type must override conflicting client copies.");

approvalRepository.ThrowConflict = true;
var conflict = await approvalService.DecideAsync(
    10,
    20,
    true,
    new ApprovalDecisionRequest(
        null,
        null,
        VehicleId: 3,
        DriverId: 4,
        ExpectedOutAt: primaryOut,
        ExpectedInAt: primaryIn,
        SecondaryExpectedOutAt: secondaryOut,
        SecondaryExpectedInAt: secondaryIn),
    "test-conflict");
Assert(!conflict.IsSuccess && conflict.ErrorCode == "VEHICLE_UNAVAILABLE",
    "Vehicle overlap conflicts must become an actionable service error.");

var hasher = new FakePasswordHasher();
var disabled = TestUser(1, false, hasher.Hash("Shared#2026"));
var active = TestUser(2, true, hasher.Hash("Shared#2026"));
var userRepository = new FakeUserRepository([disabled, active]);
var authService = new AuthService(
    userRepository,
    hasher,
    new FakeJwtTokenService(),
    new FakeQrTokenService(),
    TimeProvider.System);
var login = await authService.LoginAsync(new LoginRequest
{
    Username = "lord",
    Password = "Shared#2026"
});
Assert(login.Succeeded && login.Response?.User.Id == 2,
    "A disabled same-name candidate must not mask an active password match.");

var passwordVersion = new DateTime(2026, 8, 4, 2, 30, 0, DateTimeKind.Utc);
var jwtUser = WithPasswordVersion(
    TestUser(7, true, hasher.Hash("Token#2026")),
    passwordVersion);
var jwt = new JwtTokenService(
    Options.Create(new JwtOptions
    {
        Issuer = "RegressionTests",
        Audience = "RegressionTests",
        Key = "RegressionTests-Key-Must-Be-At-Least-32-Characters!",
        LifetimeMinutes = 15
    }),
    TimeProvider.System).CreateToken(jwtUser);
var parsedJwt = new JwtSecurityTokenHandler().ReadJwtToken(jwt.AccessToken);
Assert(parsedJwt.Claims.Single(claim => claim.Type == "password_version").Value ==
       passwordVersion.Ticks.ToString(),
    "JWTs must carry the current password version for session invalidation.");

Console.WriteLine("PASS: outside companion DTO contract");
Console.WriteLine("PASS: authoritative HRAD validation blocks missing vehicle and client spoofing");
Console.WriteLine("PASS: vehicle conflicts return VEHICLE_UNAVAILABLE");
Console.WriteLine("PASS: disabled name candidates do not mask active accounts");
Console.WriteLine("PASS: JWT password-version claim is issued");

static AuthUser TestUser(long id, bool active, string hash) => new()
{
    AccountId = id,
    EmployeeRecordId = id,
    EmployeeId = $"GA{id:000}",
    Username = $"GA{id:000}",
    DisplayName = "LORD DAN SAMPLE",
    PasswordHash = hash,
    AccountStatus = active ? "ACTIVE" : "DISABLED",
    AccountAllowsLogin = active,
    DepartmentId = 1,
    Department = "TEST",
    Roles = ["ASSOCIATE"],
    Permissions = []
};

static AuthUser WithPasswordVersion(AuthUser user, DateTime changedAt) => new()
{
    AccountId = user.AccountId,
    EmployeeRecordId = user.EmployeeRecordId,
    EmployeeId = user.EmployeeId,
    Username = user.Username,
    DisplayName = user.DisplayName,
    PasswordHash = user.PasswordHash,
    AccountStatus = user.AccountStatus,
    AccountAllowsLogin = user.AccountAllowsLogin,
    LastPasswordChangeAt = changedAt,
    DepartmentId = user.DepartmentId,
    Department = user.Department,
    Roles = user.Roles,
    Permissions = user.Permissions
};

sealed class FakeApprovalRepository : IApprovalRepository
{
    public ApprovalDecisionContext? Context { get; init; }
    public bool ThrowConflict { get; set; }
    public int DecideCount { get; private set; }
    public string? LastTripType { get; private set; }

    public Task<IReadOnlyList<ApprovalQueueItem>> GetQueueAsync(
        long approverUserId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<ApprovalQueueItem>>([]);

    public Task<ApprovalDecisionContext?> GetDecisionContextAsync(
        long gatePassId,
        long actorUserId,
        CancellationToken cancellationToken = default) => Task.FromResult(Context);

    public Task<ApprovalMutation?> DecideAsync(
        long gatePassId,
        long actorUserId,
        bool approve,
        string? comment,
        long? signatureFileId,
        string? qrTokenHash,
        DateTime? qrExpiresAt,
        long? vehicleId,
        long? driverId,
        bool? putOnHold,
        string? tripType,
        DateTime? expectedOutAt,
        DateTime? expectedInAt,
        DateTime? secondaryExpectedOutAt,
        DateTime? secondaryExpectedInAt,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        DecideCount++;
        LastTripType = tripType;
        if (ThrowConflict)
        {
            throw new VehicleReservationConflictException("Synthetic overlap.");
        }

        return Task.FromResult<ApprovalMutation?>(new ApprovalMutation(
            gatePassId,
            Context?.FormTypeCode ?? "PERSON_GATE_PASS",
            "PENDING_HRAD_ASSIGN",
            "PENDING_PAS",
            "PAS"));
    }
}

sealed class FakeOperationsRepository : IOperationsRepository
{
    public Task<DashboardSnapshot> GetDashboardAsync(
        DateTime? fromAppliedAt,
        DateTime? toAppliedAt,
        long? departmentId,
        CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();

    public Task WriteAuditAsync(
        long? actorUserId,
        string actionCode,
        string entityType,
        long? entityId,
        string? detailsJson,
        string? ipAddress,
        string? userAgent,
        string traceId,
        CancellationToken cancellationToken = default) => Task.CompletedTask;
}

sealed class FakeUserRepository(IReadOnlyList<AuthUser> users) : IUserRepository
{
    public Task<IReadOnlyList<AuthUser>> FindForLoginAsync(
        string username,
        CancellationToken cancellationToken = default) => Task.FromResult(users);

    public Task<AuthUser?> GetCurrentUserAsync(
        long accountId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(users.FirstOrDefault(user => user.AccountId == accountId));

    public Task<DateTime?> GetLastPasswordChangeAtAsync(
        long accountId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(users.FirstOrDefault(user => user.AccountId == accountId)?.LastPasswordChangeAt);

    public Task UpdateLastLoginAsync(
        long accountId,
        DateTimeOffset loggedInAt,
        CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task<bool> ChangePasswordAsync(
        long accountId,
        string passwordHash,
        DateTimeOffset changedAt,
        CancellationToken cancellationToken = default) => Task.FromResult(true);
}

sealed class FakePasswordHasher : IPasswordHasher
{
    public string Hash(string password) => $"hash::{password}";
    public bool Verify(string password, string encodedHash) => encodedHash == Hash(password);
}

sealed class FakeJwtTokenService : IJwtTokenService
{
    public TokenResult CreateToken(AuthUser user) =>
        new($"token-{user.AccountId}", DateTimeOffset.UtcNow.AddMinutes(15));
}

sealed class FakeQrTokenService : IQrTokenService
{
    public string CreateToken(long gatePassId) => $"qr-{gatePassId}";
    public string CreateEmployeeToken(long employeeRecordId) => $"employee-{employeeRecordId}";
    public bool TryGetEmployeeRecordId(string token, out long employeeRecordId) =>
        long.TryParse(token.Replace("employee-", string.Empty), out employeeRecordId);
    public string HashToken(string token) => $"hash-{token}";
}
