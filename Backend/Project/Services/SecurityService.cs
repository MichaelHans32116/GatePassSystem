using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;

namespace GatePassSystem.Project.Services;

public sealed class SecurityService(
    ISecurityRepository securityRepository,
    IOperationsRepository operationsRepository) : ISecurityService
{
    public Task<IReadOnlyList<SecurityQueueItem>> GetQueueAsync(
        CancellationToken cancellationToken = default) =>
        securityRepository.GetQueueAsync(cancellationToken);

    public async Task<ServiceResult<SecurityScanResult>> ScanAsync(
        long guardUserId,
        SecurityScanRequest request,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        var hasQr = !string.IsNullOrWhiteSpace(request.QrToken);
        var hasManual = !string.IsNullOrWhiteSpace(request.ManualGatePassNo);
        if (hasQr == hasManual)
        {
            return ServiceResult<SecurityScanResult>.Failure(
                "IDENTIFIER_REQUIRED",
                "Provide either a QR token or a gate pass number.");
        }

        var normalized = hasQr
            ? request.QrToken!.Trim()
            : request.ManualGatePassNo!.Trim().ToUpperInvariant();
        var identifierHash = Sha256(normalized);

        var result = await securityRepository.ScanAsync(
            guardUserId,
            hasQr ? identifierHash : null,
            hasManual ? normalized : null,
            identifierHash,
            traceId,
            cancellationToken);

        await operationsRepository.WriteAuditAsync(
            guardUserId,
            $"SECURITY_{result.ResultCode}",
            "GATE_PASS",
            result.GatePassId,
            JsonSerializer.Serialize(new
            {
                result.ResultCode,
                result.RequestStatus
            }),
            null,
            null,
            traceId,
            cancellationToken);

        return ServiceResult<SecurityScanResult>.Success(result);
    }

    private static string Sha256(string value) =>
        Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}

