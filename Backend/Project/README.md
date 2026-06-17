# Backend Project Structure

Recommended service split:

| Area | Responsibility |
| --- | --- |
| `AuthService` | Login, password hashing, current user lookup, token/session handling. |
| `GatePassWorkflowService` | Approval route calculation and status transitions. |
| `ApprovalService` | Approval/rejection actions, signature attachment, audit writes. |
| `SecurityScanService` | QR/manual scan validation, Time Out/In recording, duplicate prevention. |
| `VehicleService` | Vehicle/driver master data and availability checks. |
| `NotificationService` | Approver notifications and unread counts. |
| `AuditLogService` | Immutable action logs. |

Recommended model groups:

- User, Role, Permission, Department, Position
- GatePassRequest, GatePassApproval, GatePassScan
- Vehicle, Driver
- SignatureFile, Notification, AuditLog

Recommended DTO groups:

- Auth requests/responses
- Gate pass create/update/detail responses
- Approval queue/action responses
- Scanner request/result responses
- Admin management DTOs
