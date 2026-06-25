using GatePassSystem.Api.Infrastructure;
using GatePassSystem.Api.Infrastructure.Authorization;
using GatePassSystem.Project.DTOs.Admin;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GatePassSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/admin")]
public sealed class AdminController(IAdminService adminService) : ApiControllerBase
{
    [Authorize(Policy = GatePassPermissions.EmployeesRead)]
    [HttpGet("users")]
    public async Task<ActionResult<PagedApiResponse<AdminUserRecord>>> Users(
        [FromQuery] AdminUserQuery query,
        CancellationToken cancellationToken) =>
        Paged(await adminService.GetUsersAsync(query, cancellationToken));

    [Authorize(Policy = GatePassPermissions.UsersManage)]
    [HttpPost("users")]
    public async Task<ActionResult<ApiResponse<object>>> CreateUser(
        [FromBody] SaveAdminUserRequest request,
        CancellationToken cancellationToken)
    {
        var id = await adminService.SaveUserAsync(
            null, request, CurrentUserId, cancellationToken);
        return Success<object>(new { id }, "User created.");
    }

    [Authorize(Policy = GatePassPermissions.UsersManage)]
    [HttpPut("users/{id:long}")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateUser(
        long id,
        [FromBody] SaveAdminUserRequest request,
        CancellationToken cancellationToken)
    {
        var savedId = await adminService.SaveUserAsync(
            id, request, CurrentUserId, cancellationToken);
        return Success<object>(new { id = savedId }, "User updated.");
    }

    [Authorize(Policy = GatePassPermissions.UsersManage)]
    [HttpDelete("users/{id:long}")]
    public async Task<IActionResult> ArchiveUser(
        long id,
        CancellationToken cancellationToken)
    {
        if (id == CurrentUserId)
        {
            return Conflict(new ApiErrorResponse(
                "SELF_ARCHIVE_NOT_ALLOWED",
                "You cannot archive your own signed-in account.",
                null,
                HttpContext.TraceIdentifier));
        }
        await adminService.ArchiveUserAsync(id, cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = GatePassPermissions.DepartmentsManage)]
    [HttpGet("departments")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<DepartmentAdminRecord>>>> Departments(
        [FromQuery] bool includeInactive,
        CancellationToken cancellationToken) =>
        Success(await adminService.GetDepartmentsAsync(
            includeInactive, cancellationToken));

    [Authorize(Policy = GatePassPermissions.DepartmentsManage)]
    [HttpPost("departments")]
    public async Task<ActionResult<ApiResponse<object>>> CreateDepartment(
        [FromBody] SaveDepartmentRequest request,
        CancellationToken cancellationToken)
    {
        var id = await adminService.SaveDepartmentAsync(
            null, request, cancellationToken);
        return Success<object>(new { id }, "Department created.");
    }

    [Authorize(Policy = GatePassPermissions.DepartmentsManage)]
    [HttpPut("departments/{id:long}")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateDepartment(
        long id,
        [FromBody] SaveDepartmentRequest request,
        CancellationToken cancellationToken)
    {
        await adminService.SaveDepartmentAsync(id, request, cancellationToken);
        return Success<object>(new { id }, "Department updated.");
    }

    [Authorize(Policy = GatePassPermissions.DepartmentsManage)]
    [HttpDelete("departments/{id:long}")]
    public async Task<IActionResult> ArchiveDepartment(
        long id,
        CancellationToken cancellationToken)
    {
        await adminService.ArchiveDepartmentAsync(id, cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = GatePassPermissions.RolesManage)]
    [HttpGet("roles")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<RoleAdminRecord>>>> Roles(
        [FromQuery] bool includeInactive,
        CancellationToken cancellationToken) =>
        Success(await adminService.GetRolesAsync(
            includeInactive, cancellationToken));

    [Authorize(Policy = GatePassPermissions.RolesManage)]
    [HttpPost("roles")]
    public async Task<ActionResult<ApiResponse<object>>> CreateRole(
        [FromBody] SaveRoleRequest request,
        CancellationToken cancellationToken)
    {
        var id = await adminService.SaveRoleAsync(
            null, request, cancellationToken);
        return Success<object>(new { id }, "Role created.");
    }

    [Authorize(Policy = GatePassPermissions.RolesManage)]
    [HttpPut("roles/{id:long}")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateRole(
        long id,
        [FromBody] SaveRoleRequest request,
        CancellationToken cancellationToken)
    {
        await adminService.SaveRoleAsync(id, request, cancellationToken);
        return Success<object>(new { id }, "Role updated.");
    }

    [Authorize(Policy = GatePassPermissions.RolesManage)]
    [HttpDelete("roles/{id:long}")]
    public async Task<IActionResult> ArchiveRole(
        long id,
        CancellationToken cancellationToken)
    {
        await adminService.ArchiveRoleAsync(id, cancellationToken);
        return NoContent();
    }

    [Authorize(Policy = GatePassPermissions.RolesManage)]
    [HttpGet("permissions")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<PermissionAdminRecord>>>> Permissions(
        CancellationToken cancellationToken) =>
        Success(await adminService.GetPermissionsAsync(cancellationToken));
}
