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
}

