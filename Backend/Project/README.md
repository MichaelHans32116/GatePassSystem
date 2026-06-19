# Backend Project Structure

Implemented foundation services:

- `AuthService`: employee/system account login and current-user retrieval.
- `JwtTokenService`: JWT creation with multiple role and permission claims.
- `Pbkdf2PasswordHasher`: salted PBKDF2-SHA256 password hashing.
- `UserRepository`: async Dapper account, employee, role, and permission lookup.
- `DatabaseHealthRepository`: MariaDB connectivity check.

Implemented Phase 2 domain split:

| Area | Responsibility |
| --- | --- |
| `AuthService` | Login, password hashing, current user lookup, token/session handling. |
| `GatePassService` | Approval route calculation, request creation, submission, details, and paging. |
| `ApprovalService` | Approval/rejection actions, signature attachment, audit writes. |
| `SecurityService` | QR/manual scan validation, Time Out/In recording, and row-lock duplicate prevention. |
| `FleetService` | Vehicle/driver master data and overlap-safe reservations. |
| `SignatureService` | Signature-file metadata registration and retrieval. |
| `DashboardService` | Stored-procedure dashboard snapshots and status totals. |
| `NotificationService` | Approver notifications and unread counts. |
| `OperationsRepository` | Immutable audit writes and dashboard multi-result reads. |

Model groups:

- User, Role, Permission, Department, Position
- GatePassRequest, GatePassApproval, GatePassScan
- Vehicle, Driver
- SignatureFile, Notification, AuditLog

DTO groups:

- Auth requests/responses
- Gate pass create/update/detail responses
- Approval queue/action responses
- Scanner request/result responses
- Admin management DTOs

HTTP controllers remain a Phase 3 concern so the project layer stays usable
independently of ASP.NET Core.
