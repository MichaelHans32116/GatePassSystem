using System.Data;
using Dapper;
using FormRequestSystem.Project.Models;

namespace FormRequestSystem.Project.Repositories;

public sealed class OperationsRepository(
    IDatabaseConnectionFactory connectionFactory) : IOperationsRepository
{
    public async Task<DashboardSnapshot> GetDashboardAsync(
        DateTime? fromAppliedAt,
        DateTime? toAppliedAt,
        long? departmentId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        using var grid = await connection.QueryMultipleAsync(
            new CommandDefinition(
                "SP_GetGatePassDashboardSnapshot",
                new
                {
                    p_from_applied_at = fromAppliedAt,
                    p_to_applied_at = toAppliedAt,
                    p_department_id = departmentId
                },
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        var totals = await grid.ReadSingleAsync<DashboardSnapshot>();
        var statuses = (await grid.ReadAsync<DashboardStatusCount>()).AsList();
        return new DashboardSnapshot
        {
            TotalApplications = totals.TotalApplications,
            PendingApplications = totals.PendingApplications,
            ApprovedApplications = totals.ApprovedApplications,
            RejectedApplications = totals.RejectedApplications,
            CurrentlyOutside = totals.CurrentlyOutside,
            CompletedTransactions = totals.CompletedTransactions,
            StatusCounts = statuses
        };
    }

    public async Task WriteAuditAsync(
        long? actorUserId,
        string actionCode,
        string entityType,
        long? entityId,
        string? detailsJson,
        string? ipAddress,
        string? userAgent,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(
            """
            INSERT INTO tbl_audit_logs (
                actor_user_id,
                action_code,
                entity_type,
                entity_id,
                details_json,
                ip_address,
                user_agent,
                trace_id
            ) VALUES (
                @ActorUserId,
                @ActionCode,
                @EntityType,
                @EntityId,
                @DetailsJson,
                @IpAddress,
                @UserAgent,
                @TraceId
            );
            """,
            new
            {
                ActorUserId = actorUserId,
                ActionCode = actionCode,
                EntityType = entityType,
                EntityId = entityId,
                DetailsJson = detailsJson,
                IpAddress = ipAddress,
                UserAgent = userAgent,
                TraceId = traceId
            },
            cancellationToken: cancellationToken));
    }
}

