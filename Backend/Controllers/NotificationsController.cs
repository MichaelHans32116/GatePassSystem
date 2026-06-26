using System.Data;
using Dapper;
using GatePassSystem.Api.Infrastructure;
using GatePassSystem.Project.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GatePassSystem.Api.Controllers;

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

    [HttpPost("mark-read")]
    public async Task<ActionResult<ApiResponse<object>>> MarkRead(
        CancellationToken cancellationToken)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
        
        var query = """
            UPDATE tbl_notifications
            SET is_read = TRUE, read_at = NOW()
            WHERE user_id = @UserId AND is_read = FALSE;
            """;
            
        await connection.ExecuteAsync(
            new CommandDefinition(query, new { UserId = CurrentUserId }, cancellationToken: cancellationToken));
            
        return Success<object>(new { success = true }, "Notifications marked as read.");
    }
}
