using Dapper;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public sealed class EmployeeRepository(
    IDatabaseConnectionFactory connectionFactory) : IEmployeeRepository
{
    public async Task<RequesterContext?> GetRequesterContextAsync(
        long userId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        var employee = await connection.QuerySingleOrDefaultAsync<RequesterRow>(
            new CommandDefinition(
                """
                SELECT
                    ua.user_id AS UserId,
                    e.employee_record_id AS EmployeeRecordId,
                    e.department_id AS DepartmentId,
                    e.position_id AS PositionId,
                    e.employee_id AS EmployeeId,
                    e.full_name AS FullName
                FROM tbl_user_accounts ua
                JOIN tbl_employees e
                    ON e.employee_record_id = ua.employee_record_id
                WHERE ua.user_id = @UserId
                  AND ua.account_status_code = 'ACTIVE'
                  AND e.employment_status_code = 'ACTIVE'
                LIMIT 1;
                """,
                new { UserId = userId },
                cancellationToken: cancellationToken));

        if (employee is null)
        {
            return null;
        }

        var roles = (await connection.QueryAsync<string>(
            new CommandDefinition(
                """
                SELECT r.role_code
                FROM tbl_user_roles ur
                JOIN tbl_roles r ON r.role_id = ur.role_id
                WHERE ur.user_id = @UserId
                  AND ur.is_active = TRUE
                  AND r.is_active = TRUE
                ORDER BY r.role_code;
                """,
                new { UserId = userId },
                cancellationToken: cancellationToken))).AsList();

        return new RequesterContext
        {
            UserId = employee.UserId,
            EmployeeRecordId = employee.EmployeeRecordId,
            DepartmentId = employee.DepartmentId,
            PositionId = employee.PositionId,
            EmployeeId = employee.EmployeeId,
            FullName = employee.FullName,
            Roles = roles
        };
    }

    private sealed class RequesterRow
    {
        public long UserId { get; init; }
        public long EmployeeRecordId { get; init; }
        public long DepartmentId { get; init; }
        public long PositionId { get; init; }
        public string EmployeeId { get; init; } = string.Empty;
        public string FullName { get; init; } = string.Empty;
    }
}

