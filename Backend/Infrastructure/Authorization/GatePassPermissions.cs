namespace GatePassSystem.Api.Infrastructure.Authorization;

public static class GatePassPermissions
{
    public const string CreateOwn = "gatepass.create.own";
    public const string ReadOwn = "gatepass.read.own";
    public const string ReadAll = "gatepass.read.all";
    public const string ApproveSuperior = "gatepass.approve.superior";
    public const string ApprovePresident = "gatepass.approve.president";
    public const string NotePas = "gatepass.note.pas";
    public const string Scan = "gatepass.scan";
    public const string MonitorOutside = "gatepass.monitor.outside";
    public const string FleetManage = "fleet.manage";
    public const string ReportsView = "reports.view";
    public const string EmployeesRead = "employees.read";
    public const string UsersManage = "users.manage";
    public const string RolesManage = "roles.manage";
    public const string DepartmentsManage = "departments.manage";
    public const string AuditView = "audit.view";

    public static readonly string[] All =
    [
        CreateOwn,
        ReadOwn,
        ReadAll,
        ApproveSuperior,
        ApprovePresident,
        NotePas,
        Scan,
        MonitorOutside,
        FleetManage,
        ReportsView,
        EmployeesRead,
        UsersManage,
        RolesManage,
        DepartmentsManage,
        AuditView
    ];
}

