using System.Data;
using Dapper;
using FormRequestSystem.Api.Infrastructure;
using FormRequestSystem.Project.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FormRequestSystem.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/notifications")]
public sealed class NotificationsController(
    IDatabaseConnectionFactory connectionFactory) : ApiControllerBase
{
    public sealed record NotificationRecord(
        long NotificationId,
        long UserId,
        string Title,
        string Message,
        string NotificationTypeCode,
        string? RelatedEntityType,
        long? RelatedEntityId,
        bool IsRead,
        DateTime CreatedAt);

    public sealed record MarkReadRequest(List<long>? NotificationIds);

    [HttpGet("unread")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<NotificationRecord>>>> GetUnread(
        CancellationToken cancellationToken)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        
        var query = """
            SELECT 
                CAST(notification_id AS SIGNED) AS NotificationId, 
                CAST(user_id AS SIGNED) AS UserId, 
                title, 
                message, 
                notification_type_code AS NotificationTypeCode, 
                related_entity_type AS RelatedEntityType, 
                CAST(related_entity_id AS SIGNED) AS RelatedEntityId, 
                is_read AS IsRead, 
                created_at AS CreatedAt
            FROM tbl_notifications
            WHERE user_id = @UserId AND is_read = FALSE
            ORDER BY created_at DESC;
            """;
            
        var list = (await connection.QueryAsync<NotificationRecord>(
            new CommandDefinition(query, new { UserId = CurrentUserId }, cancellationToken: cancellationToken)))
            .ToList();
            
        return Success<IReadOnlyList<NotificationRecord>>(list);
    }

    /// <summary>
    /// Returns all notifications (read and unread) for the current user, limited to the most recent 50.
    /// Used by the notification dropdown panel.
    /// </summary>
    [HttpGet("all")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<NotificationRecord>>>> GetAll(
        CancellationToken cancellationToken)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);

        var query = """
            SELECT 
                CAST(notification_id AS SIGNED) AS NotificationId, 
                CAST(user_id AS SIGNED) AS UserId, 
                title, 
                message, 
                notification_type_code AS NotificationTypeCode, 
                related_entity_type AS RelatedEntityType, 
                CAST(related_entity_id AS SIGNED) AS RelatedEntityId, 
                is_read AS IsRead, 
                created_at AS CreatedAt
            FROM tbl_notifications
            WHERE user_id = @UserId
            ORDER BY created_at DESC
            LIMIT 50;
            """;

        var list = (await connection.QueryAsync<NotificationRecord>(
            new CommandDefinition(query, new { UserId = CurrentUserId }, cancellationToken: cancellationToken)))
            .ToList();

        return Success<IReadOnlyList<NotificationRecord>>(list);
    }

    [HttpPost("mark-read")]
    public async Task<ActionResult<ApiResponse<object>>> MarkRead(
        [FromBody] MarkReadRequest? request,
        CancellationToken cancellationToken)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);

        if (request?.NotificationIds is { Count: > 0 } ids)
        {
            // Mark specific notifications as read
            var query = """
                UPDATE tbl_notifications
                SET is_read = TRUE, read_at = NOW()
                WHERE user_id = @UserId AND notification_id IN @NotificationIds AND is_read = FALSE;
                """;

            await connection.ExecuteAsync(
                new CommandDefinition(query, new { UserId = CurrentUserId, NotificationIds = ids }, cancellationToken: cancellationToken));
        }
        else
        {
            // Fallback: mark ALL unread notifications as read for this user
            var query = """
                UPDATE tbl_notifications
                SET is_read = TRUE, read_at = NOW()
                WHERE user_id = @UserId AND is_read = FALSE;
                """;

            await connection.ExecuteAsync(
                new CommandDefinition(query, new { UserId = CurrentUserId }, cancellationToken: cancellationToken));
        }
            
        return Success<object>(new { success = true }, "Notifications marked as read.");
    }
}

