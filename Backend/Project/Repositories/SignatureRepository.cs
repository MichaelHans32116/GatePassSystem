using Dapper;
using GatePassSystem.Project.DTOs.Fleet;
using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public sealed class SignatureRepository(
    IDatabaseConnectionFactory connectionFactory) : ISignatureRepository
{
    public async Task<SignatureFileRecord> CreateAsync(
        long ownerUserId,
        SignatureMetadataRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);

        var id = await connection.QuerySingleAsync<long>(new CommandDefinition(
            """
            INSERT INTO tbl_signature_files (
                owner_user_id,
                file_name,
                content_type,
                storage_path,
                content_sha256,
                width_percent,
                y_offset
            ) VALUES (
                @OwnerUserId,
                @FileName,
                @ContentType,
                @StoragePath,
                @ContentSha256,
                @WidthPercent,
                @YOffset
            );
            SELECT LAST_INSERT_ID();
            """,
            new
            {
                OwnerUserId = ownerUserId,
                request.FileName,
                request.ContentType,
                request.StoragePath,
                request.ContentSha256,
                request.WidthPercent,
                request.YOffset
            },
            cancellationToken: cancellationToken));

        return (await GetAsync(id, cancellationToken))!;
    }

    public async Task<SignatureFileRecord?> GetAsync(
        long signatureFileId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<SignatureFileRecord>(
            new CommandDefinition(
                """
                SELECT
                    signature_file_id AS SignatureFileId,
                    owner_user_id AS OwnerUserId,
                    file_name AS FileName,
                    content_type AS ContentType,
                    storage_path AS StoragePath,
                    content_sha256 AS ContentSha256,
                    width_percent AS WidthPercent,
                    y_offset AS YOffset,
                    is_active AS IsActive,
                    created_at AS CreatedAt
                FROM tbl_signature_files
                WHERE signature_file_id = @SignatureFileId
                  AND is_active = TRUE;
                """,
                new { SignatureFileId = signatureFileId },
                cancellationToken: cancellationToken));
    }

    public async Task<bool> CanUserReadAsync(
        long signatureFileId,
        long userId,
        CancellationToken cancellationToken = default)
    {
        await using var connection =
            await connectionFactory.OpenConnectionAsync(cancellationToken);
        return await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            """
            SELECT COUNT(*)
            FROM tbl_signature_files signature_file
            WHERE signature_file.signature_file_id = @SignatureFileId
              AND signature_file.is_active = TRUE
              AND (
                  signature_file.owner_user_id = @UserId
                  OR EXISTS (
                      SELECT 1
                      FROM tbl_approval_signatures approval_signature
                      JOIN tbl_gate_pass_approval_steps approval_step
                        ON approval_step.approval_step_id =
                           approval_signature.approval_step_id
                      JOIN tbl_gate_pass_requests request_row
                        ON request_row.gate_pass_id =
                           approval_step.gate_pass_id
                      WHERE approval_signature.signature_file_id =
                            signature_file.signature_file_id
                        AND (
                            request_row.requester_user_id = @UserId
                            OR EXISTS (
                                SELECT 1
                                FROM tbl_gate_pass_approval_steps viewer_step
                                WHERE viewer_step.gate_pass_id =
                                      request_row.gate_pass_id
                                  AND viewer_step.assigned_approver_user_id =
                                      @UserId
                            )
                        )
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM tbl_gate_pass_requests prepared_request
                      WHERE prepared_request.prepared_by_signature_file_id =
                            signature_file.signature_file_id
                        AND (
                            prepared_request.requester_user_id = @UserId
                            OR EXISTS (
                                SELECT 1
                                FROM tbl_gate_pass_approval_steps prepared_viewer_step
                                WHERE prepared_viewer_step.gate_pass_id =
                                      prepared_request.gate_pass_id
                                  AND prepared_viewer_step.assigned_approver_user_id =
                                      @UserId
                            )
                        )
                  )
              );
            """,
            new
            {
                SignatureFileId = signatureFileId,
                UserId = userId
            },
            cancellationToken: cancellationToken)) > 0;
    }
}
