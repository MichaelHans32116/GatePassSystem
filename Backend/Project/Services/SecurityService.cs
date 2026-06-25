using System.Text.Json;
using GatePassSystem.Project.DTOs.Common;
using GatePassSystem.Project.DTOs.GatePass;
using GatePassSystem.Project.DTOs.Security;
using GatePassSystem.Project.Models;
using GatePassSystem.Project.Repositories;

namespace GatePassSystem.Project.Services;

public sealed class SecurityService(
    ISecurityRepository securityRepository,
    IOperationsRepository operationsRepository,
    IQrTokenService qrTokenService) : ISecurityService
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
        long? employeeRecordId = null;
        if (hasQr &&
            normalized.StartsWith("EMP1.", StringComparison.Ordinal))
        {
            if (!qrTokenService.TryGetEmployeeRecordId(
                    normalized,
                    out var parsedEmployeeRecordId))
            {
                return ServiceResult<SecurityScanResult>.Failure(
                    "INVALID_EMPLOYEE_QR",
                    "The employee QR code is invalid.");
            }

            employeeRecordId = parsedEmployeeRecordId;
        }

        var identifierHash = qrTokenService.HashToken(normalized);

        var result = await securityRepository.ScanAsync(
            guardUserId,
            hasQr && !employeeRecordId.HasValue ? identifierHash : null,
            employeeRecordId,
            hasManual ? normalized : null,
            identifierHash,
            traceId,
            request.SignatureFileId,
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

    public Task<EmployeePassesResult> GetEmployeePassesAsync(
        long employeeRecordId,
        CancellationToken cancellationToken = default) =>
        securityRepository.GetEmployeePassesAsync(employeeRecordId, cancellationToken);
}
