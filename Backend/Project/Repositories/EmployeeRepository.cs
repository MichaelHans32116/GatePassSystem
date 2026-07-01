using Dapper;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

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
                    department.department_name AS DepartmentName,
                    e.position_id AS PositionId,
                    e.employee_id AS EmployeeId,
                    e.full_name AS FullName
                FROM tbl_user_accounts ua
                JOIN tbl_employees e
                    ON e.employee_record_id = ua.employee_record_id
                LEFT JOIN tbl_departments department
                    ON department.department_id = e.department_id
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

        var requestableDepartments =
            (await connection.QueryAsync<DepartmentAccessRecord>(
                new CommandDefinition(
                    """
                    SELECT
                        department.department_id AS DepartmentId,
                        department.department_code AS DepartmentCode,
                        department.department_name AS DepartmentName
                    FROM tbl_departments department
                    WHERE department.is_active = TRUE
                      AND (
                          department.department_id = @HomeDepartmentId
                          OR EXISTS (
                              SELECT 1
                              FROM tbl_user_department_assignments access
                              WHERE access.user_id = @UserId
                                AND access.department_id =
                                    department.department_id
                                AND access.can_request = TRUE
                                AND access.is_active = TRUE
                          )
                      )
                    ORDER BY department.department_name;
                    """,
                    new
                    {
                        HomeDepartmentId = employee.DepartmentId,
                        employee.UserId
                    },
                    cancellationToken: cancellationToken))).AsList();

        return new RequesterContext
        {
            UserId = employee.UserId,
            EmployeeRecordId = employee.EmployeeRecordId,
            DepartmentId = employee.DepartmentId,
            DepartmentName = employee.DepartmentName,
            PositionId = employee.PositionId,
            EmployeeId = employee.EmployeeId,
            FullName = employee.FullName,
            Roles = roles,
            RequestableDepartments = requestableDepartments
        };
    }

    public async Task<EmployeeLookupRecord?> GetActiveEmployeeAsync(
        long employeeRecordId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        return await connection.QuerySingleOrDefaultAsync<EmployeeLookupRecord>(
            new CommandDefinition(
                """
                SELECT
                    employee.employee_record_id AS EmployeeRecordId,
                    employee.employee_id AS EmployeeId,
                    employee.full_name AS FullName,
                    employee.department_id AS DepartmentId,
                    department.department_name AS DepartmentName,
                    position.position_name AS PositionName
                FROM tbl_employees employee
                LEFT JOIN tbl_departments department
                    ON department.department_id = employee.department_id
                JOIN tbl_positions position
                    ON position.position_id = employee.position_id
                WHERE employee.employee_record_id = @EmployeeRecordId
                  AND employee.employment_status_code = 'ACTIVE'
                LIMIT 1;
                """,
                new { EmployeeRecordId = employeeRecordId },
                cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<EmployeeLookupRecord>> SearchActiveEmployeesAsync(
        string? search,
        int limit,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        var items = await connection.QueryAsync<EmployeeLookupRecord>(
            new CommandDefinition(
                """
                SELECT
                    employee.employee_record_id AS EmployeeRecordId,
                    employee.employee_id AS EmployeeId,
                    employee.full_name AS FullName,
                    employee.department_id AS DepartmentId,
                    department.department_name AS DepartmentName,
                    position.position_name AS PositionName
                FROM tbl_employees employee
                LEFT JOIN tbl_departments department
                    ON department.department_id = employee.department_id
                JOIN tbl_positions position
                    ON position.position_id = employee.position_id
                WHERE employee.employment_status_code = 'ACTIVE'
                  AND (
                      @Search IS NULL
                      OR employee.employee_id LIKE CONCAT('%', @Search, '%')
                      OR employee.full_name LIKE CONCAT('%', @Search, '%')
                  OR COALESCE(department.department_name, '') LIKE CONCAT('%', @Search, '%')
                  )
                ORDER BY employee.full_name
                LIMIT @Limit;
                """,
                new
                {
                    Search = string.IsNullOrWhiteSpace(search)
                        ? null
                        : search.Trim(),
                    Limit = Math.Clamp(limit, 1, 100)
                },
                cancellationToken: cancellationToken));

        return items.AsList();
    }

    private sealed class RequesterRow
    {
        public long UserId { get; init; }
        public long EmployeeRecordId { get; init; }
        public long? DepartmentId { get; init; }
        public string? DepartmentName { get; init; }
        public long PositionId { get; init; }
        public string EmployeeId { get; init; } = string.Empty;
        public string FullName { get; init; } = string.Empty;
    }
}

