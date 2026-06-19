using Dapper;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public sealed class UserRepository(IDatabaseConnectionFactory connectionFactory) : IUserRepository
{
    private const string UserSelect = """
        SELECT
            ua.user_id AS AccountId,
            ua.employee_record_id AS EmployeeRecordId,
            e.employee_id AS EmployeeId,
            ua.username AS Username,
            COALESCE(e.full_name, ua.display_name) AS DisplayName,
            ua.password_hash AS PasswordHash,
            ua.account_status_code AS AccountStatus,
            account_status.allows_login AS AccountAllowsLogin,
            ua.must_change_password AS MustChangePassword,
            d.department_name AS Department,
            p.position_name AS Position
        FROM tbl_user_accounts ua
        LEFT JOIN tbl_employees e
            ON e.employee_record_id = ua.employee_record_id
        LEFT JOIN tbl_departments d
            ON d.department_id = e.department_id
        LEFT JOIN tbl_positions p
            ON p.position_id = e.position_id
        JOIN tbl_account_statuses account_status
            ON account_status.account_status_code = ua.account_status_code
        """;

    public Task<AuthUser?> FindForLoginAsync(
        string username,
        CancellationToken cancellationToken = default) =>
        QueryUserAsync(
            $"{UserSelect} WHERE ua.username = @Username LIMIT 1;",
            new { Username = username },
            cancellationToken);

    public Task<AuthUser?> GetCurrentUserAsync(
        long accountId,
        CancellationToken cancellationToken = default) =>
        QueryUserAsync(
            $"{UserSelect} WHERE ua.user_id = @AccountId LIMIT 1;",
            new { AccountId = accountId },
            cancellationToken);

    public async Task UpdateLastLoginAsync(
        long accountId,
        DateTimeOffset loggedInAt,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE tbl_user_accounts
            SET last_login_at = @LoggedInAt
            WHERE user_id = @AccountId;
            """,
            new { AccountId = accountId, LoggedInAt = loggedInAt.UtcDateTime },
            cancellationToken: cancellationToken));
    }

    private async Task<AuthUser?> QueryUserAsync(
        string userSql,
        object parameters,
        CancellationToken cancellationToken)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);

        var user = await connection.QuerySingleOrDefaultAsync<AuthUserRow>(
            new CommandDefinition(userSql, parameters, cancellationToken: cancellationToken));

        if (user is null)
        {
            return null;
        }

        var roles = (await connection.QueryAsync<string>(new CommandDefinition(
            """
            SELECT r.role_code
            FROM tbl_user_roles ur
            JOIN tbl_roles r ON r.role_id = ur.role_id
            WHERE ur.user_id = @AccountId
              AND ur.is_active = TRUE
            ORDER BY r.role_code;
            """,
            new { user.AccountId },
            cancellationToken: cancellationToken))).AsList();

        var permissions = (await connection.QueryAsync<string>(new CommandDefinition(
            """
            SELECT DISTINCT p.permission_code
            FROM tbl_user_roles ur
            JOIN tbl_role_permissions rp ON rp.role_id = ur.role_id
            JOIN tbl_permissions p ON p.permission_id = rp.permission_id
            WHERE ur.user_id = @AccountId
              AND ur.is_active = TRUE
            ORDER BY p.permission_code;
            """,
            new { user.AccountId },
            cancellationToken: cancellationToken))).AsList();

        return new AuthUser
        {
            AccountId = user.AccountId,
            EmployeeRecordId = user.EmployeeRecordId,
            EmployeeId = user.EmployeeId,
            Username = user.Username,
            DisplayName = user.DisplayName,
            PasswordHash = user.PasswordHash,
            AccountStatus = user.AccountStatus,
            AccountAllowsLogin = user.AccountAllowsLogin,
            MustChangePassword = user.MustChangePassword,
            Department = user.Department,
            Position = user.Position,
            Roles = roles,
            Permissions = permissions
        };
    }

    private sealed class AuthUserRow
    {
        public long AccountId { get; init; }
        public long? EmployeeRecordId { get; init; }
        public string? EmployeeId { get; init; }
        public string Username { get; init; } = string.Empty;
        public string DisplayName { get; init; } = string.Empty;
        public string PasswordHash { get; init; } = string.Empty;
        public string AccountStatus { get; init; } = string.Empty;
        public bool AccountAllowsLogin { get; init; }
        public bool MustChangePassword { get; init; }
        public string? Department { get; init; }
        public string? Position { get; init; }
    }
}
