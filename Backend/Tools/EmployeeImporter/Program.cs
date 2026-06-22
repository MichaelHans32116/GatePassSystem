using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using Dapper;
using GatePassSystem.Project.Services;
using MySqlConnector;

namespace GatePassSystem.EmployeeImporter;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        var options = ImportOptions.Parse(args);
        if (!File.Exists(options.FilePath))
        {
            Console.Error.WriteLine($"Workbook not found: {options.FilePath}");
            return 2;
        }

        var employees = ReadApprovedEmployeeFields(options.FilePath);
        var activeCount = employees.Count(employee => employee.EmploymentStatus == "ACTIVE");
        var inactiveCount = employees.Count - activeCount;

        Console.WriteLine($"Validated {employees.Count} employee records.");
        Console.WriteLine($"Active selected for import: {activeCount}");
        Console.WriteLine($"Inactive skipped or used only to archive existing accounts: {inactiveCount}");
        Console.WriteLine(
            "Fields read: Employee ID, Full Name, Department, Position, Date Hired, Employment Status.");

        if (!options.Apply)
        {
            Console.WriteLine("Dry run complete. Add --apply to write to MariaDB.");
            return 0;
        }

        if (string.IsNullOrWhiteSpace(options.ConnectionString))
        {
            Console.Error.WriteLine(
                "A MariaDB connection is required. Use --connection or GATEPASS_DB_CONNECTION.");
            return 2;
        }

        await ImportAsync(employees, options.FilePath, options.ConnectionString);
        Console.WriteLine("Employee import completed successfully.");
        return 0;
    }

static List<EmployeeImportRow> ReadApprovedEmployeeFields(string filePath)
{
    using var workbook = new XLWorkbook(filePath);
    var worksheet = workbook.Worksheets.FirstOrDefault(
        sheet => string.Equals(sheet.Name, "Employees", StringComparison.OrdinalIgnoreCase))
        ?? workbook.Worksheets.First();

    var headerRow = worksheet.RowsUsed()
        .Take(20)
        .FirstOrDefault(row =>
            string.Equals(
                row.CellsUsed().FirstOrDefault()?.GetString().Trim(),
                "Employee ID",
                StringComparison.OrdinalIgnoreCase));

    if (headerRow is null)
    {
        throw new InvalidOperationException("Could not find the employee header row.");
    }

    var requiredHeaders = new[]
    {
        "Employee ID",
        "Full Name",
        "Department",
        "Position",
        "Employment Status",
        "Date Hired"
    };

    var columns = headerRow.CellsUsed()
        .Where(cell => requiredHeaders.Contains(
            cell.GetString().Trim(),
            StringComparer.OrdinalIgnoreCase))
        .ToDictionary(
            cell => cell.GetString().Trim(),
            cell => cell.Address.ColumnNumber,
            StringComparer.OrdinalIgnoreCase);

    var missingHeaders = requiredHeaders.Where(header => !columns.ContainsKey(header)).ToArray();
    if (missingHeaders.Length > 0)
    {
        throw new InvalidOperationException(
            $"Workbook is missing required columns: {string.Join(", ", missingHeaders)}");
    }

    var employees = new List<EmployeeImportRow>();
    var seenEmployeeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    var lastRow = worksheet.LastRowUsed()?.RowNumber() ?? headerRow.RowNumber();

    for (var rowNumber = headerRow.RowNumber() + 1; rowNumber <= lastRow; rowNumber++)
    {
        var row = worksheet.Row(rowNumber);
        var employeeId = ReadText(row, columns["Employee ID"]);
        var status = NormalizeStatus(ReadText(row, columns["Employment Status"]));

        if (string.IsNullOrWhiteSpace(employeeId) || status is null)
        {
            continue;
        }

        var fullName = ReadText(row, columns["Full Name"]);
        var department = ReadText(row, columns["Department"]);
        var position = ReadText(row, columns["Position"]);
        var dateHired = ReadDate(row.Cell(columns["Date Hired"]));

        if (string.IsNullOrWhiteSpace(fullName) ||
            string.IsNullOrWhiteSpace(department) ||
            string.IsNullOrWhiteSpace(position) ||
            dateHired is null)
        {
            throw new InvalidOperationException(
                $"Employee row {rowNumber} is missing an approved required field.");
        }

        if (!seenEmployeeIds.Add(employeeId))
        {
            throw new InvalidOperationException(
                $"Duplicate employee ID found in workbook: {employeeId}");
        }

        employees.Add(new EmployeeImportRow(
            employeeId,
            fullName,
            department,
            position,
            dateHired.Value,
            status));
    }

    return employees;
}

static async Task ImportAsync(
    IReadOnlyCollection<EmployeeImportRow> employees,
    string sourceFilePath,
    string connectionString)
{
    await using var connection = new MySqlConnection(connectionString);
    await connection.OpenAsync();
    await connection.ExecuteAsync("SET time_zone = '+00:00';");
    await using var transaction = await connection.BeginTransactionAsync();
    var passwordHasher = new Pbkdf2PasswordHasher();
    await using var sourceFileStream = File.OpenRead(sourceFilePath);
    var fileHash = Convert.ToHexString(
        await SHA256.HashDataAsync(sourceFileStream));
    var activeRows = employees.Count(employee => employee.EmploymentStatus == "ACTIVE");
    var inactiveRows = employees.Count - activeRows;

    var importBatchId = await connection.ExecuteScalarAsync<long>(
        """
        INSERT INTO tbl_employee_import_batches (
            source_file_name,
            source_file_sha256,
            total_rows,
            active_rows,
            inactive_rows,
            import_status_code
        )
        VALUES (
            @SourceFileName,
            @SourceFileSha256,
            @TotalRows,
            @ActiveRows,
            @InactiveRows,
            'STARTED'
        );
        SELECT LAST_INSERT_ID();
        """,
        new
        {
            SourceFileName = Path.GetFileName(sourceFilePath),
            SourceFileSha256 = fileHash,
            TotalRows = employees.Count,
            ActiveRows = activeRows,
            InactiveRows = inactiveRows
        },
        transaction);

    var roleIds = (await connection.QueryAsync<RoleRow>(
        """
        SELECT role_id AS Id, role_code AS Code
        FROM tbl_roles
        WHERE role_code IN (
            'ASSOCIATE',
            'IMMEDIATE_SUPERIOR',
            'PRESIDENT',
            'PAS_NOTER',
            'DRIVER',
            'SYSTEM_ADMIN'
        );
        """,
        transaction: transaction))
        .ToDictionary(role => role.Code, role => role.Id, StringComparer.OrdinalIgnoreCase);

    if (!roleIds.ContainsKey("ASSOCIATE"))
    {
        throw new InvalidOperationException(
            "Reference roles are missing. Run Database/seed-reference.sql before importing.");
    }

    var imported = 0;
    var accountsCreatedOrUpdated = 0;
    var accountsArchived = 0;
    var driverRecordsUpdated = 0;

    foreach (var inactiveEmployee in employees.Where(
                 employee => employee.EmploymentStatus == "INACTIVE"))
    {
        accountsArchived += await connection.ExecuteAsync(
            """
            UPDATE tbl_user_accounts ua
            JOIN tbl_employees e
                ON e.employee_record_id = ua.employee_record_id
            SET ua.account_status_code = 'ARCHIVED',
                e.employment_status_code = 'INACTIVE',
                e.source_import_batch_id = @ImportBatchId
            WHERE e.employee_id = @EmployeeId
              AND ua.account_status_code <> 'ARCHIVED';
            """,
            new
            {
                inactiveEmployee.EmployeeId,
                ImportBatchId = importBatchId
            },
            transaction);

        await connection.ExecuteAsync(
            """
            UPDATE tbl_drivers driver_row
            JOIN tbl_employees employee
                ON employee.employee_record_id =
                   driver_row.employee_record_id
            SET driver_row.is_active = FALSE
            WHERE employee.employee_id = @EmployeeId;
            """,
            new { inactiveEmployee.EmployeeId },
            transaction);
    }

    foreach (var employee in employees.Where(
                 employee => employee.EmploymentStatus == "ACTIVE"))
    {
        var departmentId = await connection.ExecuteScalarAsync<long>(
            """
            INSERT INTO tbl_departments (
                department_code,
                department_name,
                is_active
            )
            VALUES (@Code, @Name, TRUE)
            ON DUPLICATE KEY UPDATE
                department_id = LAST_INSERT_ID(department_id),
                department_name = VALUES(department_name),
                is_active = TRUE;
            SELECT LAST_INSERT_ID();
            """,
            new
            {
                Code = ToReferenceCode(employee.Department),
                Name = employee.Department
            },
            transaction);

        var positionId = await connection.ExecuteScalarAsync<long>(
            """
            INSERT INTO tbl_positions (
                department_id,
                position_name,
                is_active
            )
            VALUES (@DepartmentId, @Name, TRUE)
            ON DUPLICATE KEY UPDATE
                position_id = LAST_INSERT_ID(position_id),
                is_active = TRUE;
            SELECT LAST_INSERT_ID();
            """,
            new
            {
                DepartmentId = departmentId,
                Name = employee.Position
            },
            transaction);

        var employeeRecordId = await connection.ExecuteScalarAsync<long>(
            """
            INSERT INTO tbl_employees (
                employee_id,
                full_name,
                department_id,
                position_id,
                date_hired,
                employment_status_code,
                source_import_batch_id
            )
            VALUES (
                @EmployeeId,
                @FullName,
                @DepartmentId,
                @PositionId,
                @DateHired,
                @EmploymentStatus,
                @ImportBatchId
            )
            ON DUPLICATE KEY UPDATE
                employee_record_id = LAST_INSERT_ID(employee_record_id),
                full_name = VALUES(full_name),
                department_id = VALUES(department_id),
                position_id = VALUES(position_id),
                date_hired = VALUES(date_hired),
                employment_status_code = VALUES(employment_status_code),
                source_import_batch_id = VALUES(source_import_batch_id);
            SELECT LAST_INSERT_ID();
            """,
            new
            {
                employee.EmployeeId,
                employee.FullName,
                DepartmentId = departmentId,
                PositionId = positionId,
                DateHired = employee.DateHired.ToDateTime(TimeOnly.MinValue),
                employee.EmploymentStatus,
                ImportBatchId = importBatchId
            },
            transaction);

        imported++;

        var initialPassword = employee.DateHired.ToString("MMddyyyy", CultureInfo.InvariantCulture);
        var initialPasswordHash = passwordHasher.Hash(initialPassword);

        var accountId = await connection.ExecuteScalarAsync<long>(
            """
            INSERT INTO tbl_user_accounts (
                employee_record_id,
                username,
                display_name,
                password_hash,
                account_type_code,
                account_status_code,
                must_change_password
            )
            VALUES (
                @EmployeeRecordId,
                @Username,
                @DisplayName,
                @PasswordHash,
                'EMPLOYEE',
                'ACTIVE',
                TRUE
            )
            ON DUPLICATE KEY UPDATE
                user_id = LAST_INSERT_ID(user_id),
                employee_record_id = VALUES(employee_record_id),
                display_name = VALUES(display_name),
                account_status_code = 'ACTIVE';
            SELECT LAST_INSERT_ID();
            """,
            new
            {
                EmployeeRecordId = employeeRecordId,
                Username = employee.EmployeeId,
                DisplayName = employee.FullName,
                PasswordHash = initialPasswordHash
            },
            transaction);

        accountsCreatedOrUpdated++;
        await AssignRolesAsync(connection, transaction, accountId, employee, roleIds);

        if (employee.Position.Contains(
                "COMPANY DRIVER",
                StringComparison.OrdinalIgnoreCase))
        {
            await connection.ExecuteAsync(
                """
                INSERT INTO tbl_drivers (
                    employee_record_id,
                    full_name,
                    driver_type_code,
                    is_active
                )
                VALUES (
                    @EmployeeRecordId,
                    @FullName,
                    'EMPLOYEE',
                    @IsActive
                )
                ON DUPLICATE KEY UPDATE
                    full_name = VALUES(full_name),
                    is_active = VALUES(is_active);
                """,
                new
                {
                    EmployeeRecordId = employeeRecordId,
                    employee.FullName,
                    IsActive = true
                },
                transaction);

            driverRecordsUpdated++;
        }
    }

    await SyncApprovalAssignmentsAsync(connection, transaction);

    await connection.ExecuteAsync(
        """
        UPDATE tbl_employee_import_batches
        SET import_status_code = 'COMPLETED',
            completed_at = CURRENT_TIMESTAMP
        WHERE import_batch_id = @ImportBatchId;
        """,
        new { ImportBatchId = importBatchId },
        transaction);

    await transaction.CommitAsync();

    Console.WriteLine($"Active employee records imported: {imported}");
    Console.WriteLine($"Active accounts created/updated: {accountsCreatedOrUpdated}");
    Console.WriteLine($"Existing accounts archived: {accountsArchived}");
    Console.WriteLine($"Company driver records updated: {driverRecordsUpdated}");
    Console.WriteLine("Approval assignments synchronized from active role mappings.");
}

static async Task SyncApprovalAssignmentsAsync(
    MySqlConnection connection,
    MySqlTransaction transaction)
{
    await connection.ExecuteAsync(
        """
        DELETE FROM tbl_approval_assignments
        WHERE approval_step_code IN ('SUPERIOR', 'PRESIDENT', 'PAS');
        """,
        transaction: transaction);

    var superiorAssignments = new[]
    {
        new ApprovalAssignmentSpec("GA133", "ADMIN_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("GA150", "FINANCE_IT_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("GA150", "FINANCE_HR_IT_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("GA409", "HRAD_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("MP012", "INJECTION_ASSEMBLY_PRODUCTION_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("MP012", "PRODUCTION_ASSEMBLY_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("PP399", "PRODUCTION_ASSEMBLY_DEPARTMENT", 2, true),
        new ApprovalAssignmentSpec("PP408", "PRODUCTION_ASSEMBLY_DEPARTMENT", 3, true),
        new ApprovalAssignmentSpec("MP012", "PRODUCTION_INJECTION_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("MP012", "PRODUCTION_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("PP399", "PRODUCTION_DEPARTMENT", 2, true),
        new ApprovalAssignmentSpec("PP408", "PRODUCTION_DEPARTMENT", 3, true),
        new ApprovalAssignmentSpec("PP163", "PPC_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("PP052", "PRODUCTION_ENGINEERING_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("PP287", "PURCHASING_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("PP081", "QUALITY_ASSURANCE_DEPARTMENT", 1, false),
        new ApprovalAssignmentSpec("PP201", "QUALITY_ASSURANCE_DEPARTMENT", 2, true)
    };

    foreach (var assignment in superiorAssignments)
    {
        await InsertApprovalAssignmentAsync(
            connection,
            transaction,
            "SUPERIOR",
            assignment.EmployeeId,
            assignment.DepartmentCode,
            assignment.Priority,
            assignment.IsAlternate);
    }

    await InsertApprovalAssignmentAsync(
        connection,
        transaction,
        "PRESIDENT",
        "GA125",
        null,
        1,
        false);

    await InsertApprovalAssignmentAsync(
        connection,
        transaction,
        "PAS",
        "GA150",
        null,
        1,
        false);
    await InsertApprovalAssignmentAsync(
        connection,
        transaction,
        "PAS",
        "GA133",
        null,
        1,
        false);
    await InsertApprovalAssignmentAsync(
        connection,
        transaction,
        "PAS",
        "GA120",
        null,
        2,
        true);
    await InsertApprovalAssignmentAsync(
        connection,
        transaction,
        "PAS",
        "GA409",
        null,
        4,
        true,
        "PERSON_GATE_PASS");
    await InsertApprovalAssignmentAsync(
        connection,
        transaction,
        "PAS",
        "GA409",
        null,
        1,
        false,
        "MATERIAL_GATE_PASS");
}

static async Task InsertApprovalAssignmentAsync(
    MySqlConnection connection,
    MySqlTransaction transaction,
    string approvalStepCode,
    string employeeId,
    string? departmentCode,
    int priority,
    bool isAlternate,
    string? formTypeCode = null)
{
    var inserted = await connection.ExecuteAsync(
        """
        INSERT INTO tbl_approval_assignments (
            approval_step_code,
            form_type_code,
            approver_user_id,
            department_id,
            position_id,
            priority,
            is_alternate,
            is_active
        )
        SELECT
            @ApprovalStepCode,
            @FormTypeCode,
            account_row.user_id,
            department_row.department_id,
            NULL,
            @Priority,
            @IsAlternate,
            TRUE
        FROM tbl_employees employee
        JOIN tbl_user_accounts account_row
            ON account_row.employee_record_id =
               employee.employee_record_id
        LEFT JOIN tbl_departments department_row
            ON department_row.department_code = @DepartmentCode
        WHERE employee.employee_id = @EmployeeId
          AND employee.employment_status_code = 'ACTIVE'
          AND account_row.account_status_code = 'ACTIVE'
          AND (
              @DepartmentCode IS NULL
              OR department_row.department_id IS NOT NULL
          );
        """,
        new
        {
            ApprovalStepCode = approvalStepCode,
            FormTypeCode = formTypeCode,
            EmployeeId = employeeId,
            DepartmentCode = departmentCode,
            Priority = priority,
            IsAlternate = isAlternate
        },
        transaction);

    if (inserted != 1)
    {
        throw new InvalidOperationException(
            $"Could not configure {approvalStepCode} approver {employeeId} " +
            $"for {departmentCode ?? "all departments"}.");
    }
}

static async Task AssignRolesAsync(
    MySqlConnection connection,
    MySqlTransaction transaction,
    long accountId,
    EmployeeImportRow employee,
    IReadOnlyDictionary<string, ulong> roleIds)
{
    var desiredRoles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "ASSOCIATE"
    };

    if (ImmediateSuperiorEmployeeIds.Contains(employee.EmployeeId))
    {
        desiredRoles.Add("IMMEDIATE_SUPERIOR");
    }

    if (string.Equals(employee.EmployeeId, "GA125", StringComparison.OrdinalIgnoreCase))
    {
        desiredRoles.Add("PRESIDENT");
    }

    if (PasNoterEmployeeIds.Contains(employee.EmployeeId))
    {
        desiredRoles.Add("PAS_NOTER");
    }

    if (employee.Position.Contains(
            "COMPANY DRIVER",
            StringComparison.OrdinalIgnoreCase))
    {
        desiredRoles.Add("DRIVER");
    }

    if (SystemAdminEmployeeIds.Contains(employee.EmployeeId))
    {
        desiredRoles.Add("SYSTEM_ADMIN");
    }

    foreach (var role in roleIds)
    {
        if (desiredRoles.Contains(role.Key))
        {
            await connection.ExecuteAsync(
                """
                INSERT INTO tbl_user_roles (user_id, role_id, is_active)
                VALUES (@AccountId, @RoleId, TRUE)
                ON DUPLICATE KEY UPDATE is_active = TRUE;
                """,
                new { AccountId = accountId, RoleId = role.Value },
                transaction);
        }
        else
        {
            await connection.ExecuteAsync(
                """
                UPDATE tbl_user_roles
                SET is_active = FALSE
                WHERE user_id = @AccountId
                  AND role_id = @RoleId;
                """,
                new { AccountId = accountId, RoleId = role.Value },
                transaction);
        }
    }
}

static string ReadText(IXLRow row, int columnNumber) =>
    Regex.Replace(row.Cell(columnNumber).GetString().Trim(), @"\s+", " ");

static string? NormalizeStatus(string value) =>
    value.Trim().ToUpperInvariant() switch
    {
        "ACTIVE" => "ACTIVE",
        "INACTIVE" => "INACTIVE",
        _ => null
    };

static DateOnly? ReadDate(IXLCell cell)
{
    if (cell.TryGetValue<DateTime>(out var dateTime))
    {
        return DateOnly.FromDateTime(dateTime);
    }

    var text = cell.GetString().Trim();
    var formats = new[] { "yyyy-MM-dd", "MM/dd/yyyy", "M/d/yyyy" };
    return DateTime.TryParseExact(
        text,
        formats,
        CultureInfo.InvariantCulture,
        DateTimeStyles.None,
        out dateTime)
        ? DateOnly.FromDateTime(dateTime)
        : null;
}

static string ToReferenceCode(string value)
{
    var normalized = value.Normalize(NormalizationForm.FormD);
    var ascii = new string(normalized
        .Where(character =>
            CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
        .ToArray())
        .Normalize(NormalizationForm.FormC)
        .ToUpperInvariant();

    var code = Regex.Replace(ascii, @"[^A-Z0-9]+", "_").Trim('_');
    return code.Length <= 60 ? code : code[..60];
}

static readonly HashSet<string> ImmediateSuperiorEmployeeIds =
[
    "MP012",
    "GA150",
    "GA409",
    "PP163",
    "PP081",
    "PP201",
    "GA133",
    "PP287",
    "PP052",
    "PP399",
    "PP408"
];

static readonly HashSet<string> PasNoterEmployeeIds =
[
    "GA150",
    "GA133",
    "GA120",
    "GA409"
];

static readonly HashSet<string> SystemAdminEmployeeIds =
[
    "GA407",
    "GA153"
];
}

internal sealed record EmployeeImportRow(
    string EmployeeId,
    string FullName,
    string Department,
    string Position,
    DateOnly DateHired,
    string EmploymentStatus);

internal sealed record ApprovalAssignmentSpec(
    string EmployeeId,
    string DepartmentCode,
    int Priority,
    bool IsAlternate);

internal sealed class RoleRow
{
    public ulong Id { get; init; }
    public string Code { get; init; } = string.Empty;
}

internal sealed record ImportOptions(
    string FilePath,
    string? ConnectionString,
    bool Apply)
{
    public static ImportOptions Parse(string[] args)
    {
        string? filePath = null;
        string? connectionString =
            Environment.GetEnvironmentVariable("GATEPASS_DB_CONNECTION");
        var apply = false;

        for (var index = 0; index < args.Length; index++)
        {
            switch (args[index])
            {
                case "--file" when index + 1 < args.Length:
                    filePath = args[++index];
                    break;
                case "--connection" when index + 1 < args.Length:
                    connectionString = args[++index];
                    break;
                case "--apply":
                    apply = true;
                    break;
            }
        }

        filePath ??= Path.GetFullPath(Path.Combine(
            Directory.GetCurrentDirectory(),
            "Database",
            "employees_export_2026-06-17.xlsx"));

        return new ImportOptions(filePath, connectionString, apply);
    }
}
