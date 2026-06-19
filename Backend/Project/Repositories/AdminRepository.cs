using Dapper;
using GatePassSystem.Project.DTOs.Admin;
using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public sealed class AdminRepository(
    IDatabaseConnectionFactory connectionFactory) : IAdminRepository
{
    public async Task<PagedResult<AdminUserRecord>> GetUsersAsync(
        AdminUserQuery query,
        CancellationToken cancellationToken = default)
    {
        var page = Math.Max(query.Page, 1);
        var pageSize = Math.Clamp(query.PageSize, 1, 200);
        var offset = (page - 1) * pageSize;
        var search = string.IsNullOrWhiteSpace(query.Search)
            ? null
            : query.Search.Trim();
        var status = string.IsNullOrWhiteSpace(query.AccountStatusCode)
            ? null
            : query.AccountStatusCode.Trim().ToUpperInvariant();
        var role = string.IsNullOrWhiteSpace(query.RoleCode)
            ? null
            : query.RoleCode.Trim().ToUpperInvariant();

        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        const string where = """
            WHERE (@AccountStatusCode IS NULL
                   OR ua.account_status_code = @AccountStatusCode)
              AND (@DepartmentId IS NULL OR e.department_id = @DepartmentId)
              AND (@HiredFrom IS NULL OR e.date_hired >= @HiredFrom)
              AND (@HiredTo IS NULL OR e.date_hired <= @HiredTo)
              AND (
                  @RoleCode IS NULL OR EXISTS (
                      SELECT 1
                      FROM tbl_user_roles role_filter
                      JOIN tbl_roles filtered_role
                        ON filtered_role.role_id = role_filter.role_id
                      WHERE role_filter.user_id = ua.user_id
                        AND role_filter.is_active = TRUE
                        AND filtered_role.role_code = @RoleCode
                  )
              )
              AND (
                  @Search IS NULL
                  OR ua.username LIKE CONCAT('%', @Search, '%')
                  OR ua.display_name LIKE CONCAT('%', @Search, '%')
                  OR e.employee_id LIKE CONCAT('%', @Search, '%')
                  OR e.full_name LIKE CONCAT('%', @Search, '%')
                  OR d.department_name LIKE CONCAT('%', @Search, '%')
                  OR p.position_name LIKE CONCAT('%', @Search, '%')
              )
            """;

        var parameters = new
        {
            Search = search,
            RoleCode = role,
            query.DepartmentId,
            AccountStatusCode = status,
            query.HiredFrom,
            query.HiredTo,
            Offset = offset,
            PageSize = pageSize
        };

        using var grid = await connection.QueryMultipleAsync(
            new CommandDefinition(
                $"""
                SELECT
                    ua.user_id AS UserId,
                    ua.employee_record_id AS EmployeeRecordId,
                    e.employee_id AS EmployeeId,
                    ua.username AS Username,
                    COALESCE(e.full_name, ua.display_name) AS DisplayName,
                    d.department_name AS DepartmentName,
                    d.department_id AS DepartmentId,
                    p.position_name AS PositionName,
                    e.date_hired AS DateHired,
                    ua.account_type_code AS AccountTypeCode,
                    ua.account_status_code AS AccountStatusCode,
                    ua.must_change_password AS MustChangePassword,
                    ua.last_login_at AS LastLoginAt,
                    ua.created_at AS CreatedAt,
                    COALESCE(
                        GROUP_CONCAT(
                            DISTINCT CASE WHEN ur.is_active THEN r.role_code END
                            ORDER BY r.role_code SEPARATOR ','
                        ),
                        ''
                    ) AS RoleCodesCsv
                FROM tbl_user_accounts ua
                LEFT JOIN tbl_employees e
                    ON e.employee_record_id = ua.employee_record_id
                LEFT JOIN tbl_departments d
                    ON d.department_id = e.department_id
                LEFT JOIN tbl_positions p
                    ON p.position_id = e.position_id
                LEFT JOIN tbl_user_roles ur
                    ON ur.user_id = ua.user_id
                LEFT JOIN tbl_roles r
                    ON r.role_id = ur.role_id
                {where}
                GROUP BY ua.user_id
                ORDER BY COALESCE(e.full_name, ua.display_name), ua.username
                LIMIT @Offset, @PageSize;

                SELECT COUNT(*)
                FROM tbl_user_accounts ua
                LEFT JOIN tbl_employees e
                    ON e.employee_record_id = ua.employee_record_id
                LEFT JOIN tbl_departments d
                    ON d.department_id = e.department_id
                LEFT JOIN tbl_positions p
                    ON p.position_id = e.position_id
                {where};
                """,
                parameters,
                cancellationToken: cancellationToken));

        var users = (await grid.ReadAsync<AdminUserRecord>()).AsList();
        var total = await grid.ReadSingleAsync<long>();
        return new PagedResult<AdminUserRecord>(users, total, page, pageSize);
    }

    public async Task<long> SaveUserAsync(
        long? userId,
        SaveAdminUserRequest request,
        long changedByUserId,
        string? passwordHash,
        CancellationToken cancellationToken = default)
    {
        var username = request.Username.Trim();
        var displayName = request.DisplayName.Trim();
        var employeeId = string.IsNullOrWhiteSpace(request.EmployeeId)
            ? null
            : request.EmployeeId.Trim();
        var roleCodes = request.RoleCodes
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code.Trim().ToUpperInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (string.IsNullOrWhiteSpace(username) ||
            string.IsNullOrWhiteSpace(displayName) ||
            roleCodes.Length == 0)
        {
            throw new InvalidOperationException(
                "Username, display name, and at least one role are required.");
        }

        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            long? employeeRecordId = null;
            if (employeeId is not null)
            {
                employeeRecordId =
                    await connection.QuerySingleOrDefaultAsync<long?>(
                        new CommandDefinition(
                            """
                            SELECT employee_record_id
                            FROM tbl_employees
                            WHERE employee_id = @EmployeeId
                              AND employment_status_code = 'ACTIVE'
                            LIMIT 1;
                            """,
                            new { EmployeeId = employeeId },
                            transaction,
                            cancellationToken: cancellationToken));
                if (!employeeRecordId.HasValue)
                {
                    throw new InvalidOperationException(
                        "The selected active employee record was not found.");
                }
            }

            long savedUserId;
            if (userId.HasValue)
            {
                var affected = await connection.ExecuteAsync(
                    new CommandDefinition(
                        """
                        UPDATE tbl_user_accounts
                        SET employee_record_id = @EmployeeRecordId,
                            username = @Username,
                            display_name = @DisplayName,
                            account_type_code = @AccountTypeCode,
                            account_status_code = @AccountStatusCode,
                            must_change_password = @MustChangePassword,
                            password_hash = COALESCE(@PasswordHash, password_hash),
                            last_password_change_at =
                                CASE WHEN @PasswordHash IS NULL
                                     THEN last_password_change_at
                                     ELSE CURRENT_TIMESTAMP END
                        WHERE user_id = @UserId;
                        """,
                        new
                        {
                            UserId = userId.Value,
                            EmployeeRecordId = employeeRecordId,
                            Username = username,
                            DisplayName = displayName,
                            AccountTypeCode = request.AccountTypeCode.Trim().ToUpperInvariant(),
                            AccountStatusCode = request.AccountStatusCode.Trim().ToUpperInvariant(),
                            request.MustChangePassword,
                            PasswordHash = passwordHash
                        },
                        transaction,
                        cancellationToken: cancellationToken));
                if (affected == 0)
                {
                    throw new InvalidOperationException("User account was not found.");
                }
                savedUserId = userId.Value;
            }
            else
            {
                savedUserId = await connection.QuerySingleAsync<long>(
                    new CommandDefinition(
                        """
                        INSERT INTO tbl_user_accounts (
                            employee_record_id,
                            username,
                            display_name,
                            password_hash,
                            account_type_code,
                            account_status_code,
                            must_change_password
                        ) VALUES (
                            @EmployeeRecordId,
                            @Username,
                            @DisplayName,
                            @PasswordHash,
                            @AccountTypeCode,
                            @AccountStatusCode,
                            @MustChangePassword
                        );
                        SELECT LAST_INSERT_ID();
                        """,
                        new
                        {
                            EmployeeRecordId = employeeRecordId,
                            Username = username,
                            DisplayName = displayName,
                            PasswordHash = passwordHash!,
                            AccountTypeCode = request.AccountTypeCode.Trim().ToUpperInvariant(),
                            AccountStatusCode = request.AccountStatusCode.Trim().ToUpperInvariant(),
                            request.MustChangePassword
                        },
                        transaction,
                        cancellationToken: cancellationToken));
            }

            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_user_roles
                SET is_active = FALSE
                WHERE user_id = @UserId;
                """,
                new { UserId = savedUserId },
                transaction,
                cancellationToken: cancellationToken));

            var validRoleCount = await connection.ExecuteScalarAsync<int>(
                new CommandDefinition(
                    """
                    SELECT COUNT(*)
                    FROM tbl_roles
                    WHERE role_code IN @RoleCodes
                      AND is_active = TRUE;
                    """,
                    new { RoleCodes = roleCodes },
                    transaction,
                    cancellationToken: cancellationToken));
            if (validRoleCount != roleCodes.Length)
            {
                throw new InvalidOperationException(
                    "One or more selected roles are invalid or inactive.");
            }

            await connection.ExecuteAsync(new CommandDefinition(
                """
                INSERT INTO tbl_user_roles (
                    user_id,
                    role_id,
                    assigned_by_user_id,
                    is_active
                )
                SELECT
                    @UserId,
                    role_id,
                    @ChangedByUserId,
                    TRUE
                FROM tbl_roles
                WHERE role_code IN @RoleCodes
                  AND is_active = TRUE
                ON DUPLICATE KEY UPDATE
                    assigned_by_user_id = VALUES(assigned_by_user_id),
                    assigned_at = CURRENT_TIMESTAMP,
                    is_active = TRUE;
                """,
                new
                {
                    UserId = savedUserId,
                    ChangedByUserId = changedByUserId,
                    RoleCodes = roleCodes
                },
                transaction,
                cancellationToken: cancellationToken));

            await transaction.CommitAsync(cancellationToken);
            return savedUserId;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task ArchiveUserAsync(
        long userId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE tbl_user_accounts
            SET account_status_code = 'ARCHIVED'
            WHERE user_id = @UserId;

            UPDATE tbl_user_roles
            SET is_active = FALSE
            WHERE user_id = @UserId;
            """,
            new { UserId = userId },
            transaction,
            cancellationToken: cancellationToken));
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<DepartmentAdminRecord>> GetDepartmentsAsync(
        bool includeInactive,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<DepartmentAdminRecord>(
            new CommandDefinition(
                """
                SELECT
                    d.department_id AS DepartmentId,
                    d.department_code AS DepartmentCode,
                    d.department_name AS DepartmentName,
                    d.description AS Description,
                    d.is_active AS IsActive,
                    COUNT(
                        CASE WHEN e.employment_status_code = 'ACTIVE'
                             THEN e.employee_record_id END
                    ) AS ActiveEmployeeCount
                FROM tbl_departments d
                LEFT JOIN tbl_employees e
                    ON e.department_id = d.department_id
                WHERE @IncludeInactive = TRUE OR d.is_active = TRUE
                GROUP BY d.department_id
                ORDER BY d.department_name;
                """,
                new { IncludeInactive = includeInactive },
                cancellationToken: cancellationToken));
        return rows.AsList();
    }

    public async Task<long> SaveDepartmentAsync(
        long? departmentId,
        SaveDepartmentRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        if (departmentId.HasValue)
        {
            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE tbl_departments
                SET department_code = @DepartmentCode,
                    department_name = @DepartmentName,
                    description = @Description,
                    is_active = @IsActive
                WHERE department_id = @DepartmentId;
                """,
                new
                {
                    DepartmentId = departmentId.Value,
                    DepartmentCode = request.DepartmentCode.Trim().ToUpperInvariant(),
                    DepartmentName = request.DepartmentName.Trim(),
                    request.Description,
                    request.IsActive
                },
                cancellationToken: cancellationToken));
            return departmentId.Value;
        }

        return await connection.QuerySingleAsync<long>(new CommandDefinition(
            """
            INSERT INTO tbl_departments (
                department_code,
                department_name,
                description,
                is_active
            ) VALUES (
                @DepartmentCode,
                @DepartmentName,
                @Description,
                @IsActive
            );
            SELECT LAST_INSERT_ID();
            """,
            new
            {
                DepartmentCode = request.DepartmentCode.Trim().ToUpperInvariant(),
                DepartmentName = request.DepartmentName.Trim(),
                request.Description,
                request.IsActive
            },
            cancellationToken: cancellationToken));
    }

    public async Task ArchiveDepartmentAsync(
        long departmentId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var activeEmployees = await connection.ExecuteScalarAsync<long>(
            new CommandDefinition(
                """
                SELECT COUNT(*)
                FROM tbl_employees
                WHERE department_id = @DepartmentId
                  AND employment_status_code = 'ACTIVE';
                """,
                new { DepartmentId = departmentId },
                cancellationToken: cancellationToken));
        if (activeEmployees > 0)
        {
            throw new InvalidOperationException(
                "Department cannot be archived while active employees are assigned.");
        }
        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE tbl_departments
            SET is_active = FALSE
            WHERE department_id = @DepartmentId;
            """,
            new { DepartmentId = departmentId },
            cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<RoleAdminRecord>> GetRolesAsync(
        bool includeInactive,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<RoleAdminRecord>(
            new CommandDefinition(
                """
                SELECT
                    r.role_id AS RoleId,
                    r.role_code AS RoleCode,
                    r.role_name AS RoleName,
                    r.description AS Description,
                    r.is_system_role AS IsSystemRole,
                    r.is_active AS IsActive,
                    COUNT(
                        DISTINCT CASE WHEN ur.is_active THEN ur.user_id END
                    ) AS ActiveUserCount,
                    COALESCE(
                        GROUP_CONCAT(
                            DISTINCT p.permission_code
                            ORDER BY p.permission_code SEPARATOR ','
                        ),
                        ''
                    ) AS PermissionCodesCsv
                FROM tbl_roles r
                LEFT JOIN tbl_user_roles ur
                    ON ur.role_id = r.role_id
                LEFT JOIN tbl_role_permissions rp
                    ON rp.role_id = r.role_id
                LEFT JOIN tbl_permissions p
                    ON p.permission_id = rp.permission_id
                WHERE @IncludeInactive = TRUE OR r.is_active = TRUE
                GROUP BY r.role_id
                ORDER BY r.role_name;
                """,
                new { IncludeInactive = includeInactive },
                cancellationToken: cancellationToken));
        return rows.AsList();
    }

    public async Task<long> SaveRoleAsync(
        long? roleId,
        SaveRoleRequest request,
        CancellationToken cancellationToken = default)
    {
        var permissions = request.PermissionCodes
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await using var transaction =
            await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            long savedRoleId;
            if (roleId.HasValue)
            {
                await connection.ExecuteAsync(new CommandDefinition(
                    """
                    UPDATE tbl_roles
                    SET role_code = @RoleCode,
                        role_name = @RoleName,
                        description = @Description,
                        is_active = @IsActive
                    WHERE role_id = @RoleId;
                    """,
                    new
                    {
                        RoleId = roleId.Value,
                        RoleCode = request.RoleCode.Trim().ToUpperInvariant(),
                        RoleName = request.RoleName.Trim(),
                        request.Description,
                        request.IsActive
                    },
                    transaction,
                    cancellationToken: cancellationToken));
                savedRoleId = roleId.Value;
            }
            else
            {
                savedRoleId = await connection.QuerySingleAsync<long>(
                    new CommandDefinition(
                        """
                        INSERT INTO tbl_roles (
                            role_code,
                            role_name,
                            description,
                            is_system_role,
                            is_active
                        ) VALUES (
                            @RoleCode,
                            @RoleName,
                            @Description,
                            FALSE,
                            @IsActive
                        );
                        SELECT LAST_INSERT_ID();
                        """,
                        new
                        {
                            RoleCode = request.RoleCode.Trim().ToUpperInvariant(),
                            RoleName = request.RoleName.Trim(),
                            request.Description,
                            request.IsActive
                        },
                        transaction,
                        cancellationToken: cancellationToken));
            }

            await connection.ExecuteAsync(new CommandDefinition(
                "DELETE FROM tbl_role_permissions WHERE role_id = @RoleId;",
                new { RoleId = savedRoleId },
                transaction,
                cancellationToken: cancellationToken));
            if (permissions.Length > 0)
            {
                var inserted = await connection.ExecuteAsync(new CommandDefinition(
                    """
                    INSERT INTO tbl_role_permissions (role_id, permission_id)
                    SELECT @RoleId, permission_id
                    FROM tbl_permissions
                    WHERE permission_code IN @PermissionCodes;
                    """,
                    new { RoleId = savedRoleId, PermissionCodes = permissions },
                    transaction,
                    cancellationToken: cancellationToken));
                if (inserted != permissions.Length)
                {
                    throw new InvalidOperationException(
                        "One or more selected permissions are invalid.");
                }
            }
            await transaction.CommitAsync(cancellationToken);
            return savedRoleId;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task ArchiveRoleAsync(
        long roleId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var activeUsers = await connection.ExecuteScalarAsync<long>(
            new CommandDefinition(
                """
                SELECT COUNT(*)
                FROM tbl_user_roles
                WHERE role_id = @RoleId
                  AND is_active = TRUE;
                """,
                new { RoleId = roleId },
                cancellationToken: cancellationToken));
        if (activeUsers > 0)
        {
            throw new InvalidOperationException(
                "Role cannot be archived while active users are assigned.");
        }
        await connection.ExecuteAsync(new CommandDefinition(
            "UPDATE tbl_roles SET is_active = FALSE WHERE role_id = @RoleId;",
            new { RoleId = roleId },
            cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<PermissionAdminRecord>> GetPermissionsAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<PermissionAdminRecord>(
            new CommandDefinition(
                """
                SELECT
                    permission_id AS PermissionId,
                    permission_code AS PermissionCode,
                    description AS Description
                FROM tbl_permissions
                ORDER BY permission_code;
                """,
                cancellationToken: cancellationToken));
        return rows.AsList();
    }
}
