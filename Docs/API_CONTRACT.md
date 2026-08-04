# API Contract Draft

Base path: `/api`

Responses should use JSON. Date/time values should use ISO 8601 in backend responses and be formatted for display in the frontend.

## Auth

### POST `/auth/login`

Request:

```json
{
  "username": "SAMPLE USER",
  "password": "user-entered-password"
}
```

For employee accounts, `username` accepts the recorded name, a leading name
phrase, an individual space-delimited name token, or the legacy Employee ID.
Matching is case-insensitive. If several employees share a name token, the
password selects the correct account.

Response:

```json
{
  "accessToken": "jwt-or-session-token",
  "user": {
    "id": 1,
    "employeeId": "MPI-001",
    "username": "MPI-001",
    "fullName": "Sample Associate",
    "department": "Production",
    "position": "General Associate",
    "mustChangePassword": true,
    "roles": ["ASSOCIATE"],
    "permissions": ["gatepass.create.own", "gatepass.read.own"]
  }
}
```

Accounts can have multiple roles. For example, an employee can remain an
`ASSOCIATE` while also holding `IMMEDIATE_SUPERIOR` or `SYSTEM_ADMIN`.

### GET `/auth/me`

Returns the current authenticated user.

### POST `/auth/change-password`

Requires a valid bearer token. The current password is verified before the
PBKDF2 hash is transactionally replaced and audited.

```json
{
  "currentPassword": "current-password",
  "newPassword": "new-private-password",
  "confirmPassword": "new-private-password"
}
```

The new password must contain 8 to 128 characters. A successful change clears
`mustChangePassword`, failed-login counters, and an active account lock.

### POST `/auth/logout`

Invalidates the current session/token where applicable.

## Gate Pass Requests

### POST `/gate-pass-requests`

Creates a request and lets the backend compute the route and starting status.

Request:

```json
{
  "destination": "Laguna Technopark",
  "purpose": "Supplier visit",
  "expectedOutAt": "2026-06-17T13:00:00+08:00",
  "expectedInAt": "2026-06-17T16:00:00+08:00",
  "willReturn": true,
  "vehicleUsageCode": "COMPANY",
  "vehicleTripTypeCode": "BOTH",
  "vehicleId": 1,
  "driverId": 1,
  "includesRequestor": false,
  "associates": [
    {
      "isEmployee": false,
      "employeeId": null,
      "fullName": "VISITOR SAMPLE"
    }
  ]
}
```

Response:

```json
{
  "id": 10,
  "gatePassNo": "GP-20260617-0001",
  "status": "PendingSuperior",
  "approvalRoute": ["SUPERIOR", "HRAD_ASSIGN", "PAS"]
}
```

### GET `/gate-pass-requests/my`

Returns the logged-in user's requests.

Query:

- `status`
- `fromDate`
- `toDate`
- `page`
- `pageSize`

### GET `/gate-pass-requests/{id}`

Returns request details, approval progress, vehicle/driver data, signatures, and scan history.

### GET `/gate-pass-requests`

Admin/log listing.

Authorization:

- System Admin can see all.
- PAS / HR can see all or policy-approved scope.
- Immediate Superior can see department scope.

### POST `/gate-pass-requests/{id}/cancel`

Allows requester or admin to cancel when the request is not yet completed.

## Approvals

### GET `/approvals/queue`

Returns requests waiting for the current user's approval or noting action.

### POST `/approvals/{requestId}/approve`

Request:

```json
{
  "signatureFileId": 22,
  "comment": null,
  "tripType": "BOTH",
  "expectedOutAt": "2026-06-17T08:00:00+08:00",
  "expectedInAt": "2026-06-17T09:00:00+08:00",
  "secondaryExpectedOutAt": "2026-06-17T11:00:00+08:00",
  "secondaryExpectedInAt": "2026-06-17T12:00:00+08:00"
}
```

Response:

```json
{
  "requestId": 10,
  "previousStatus": "PENDING_HRAD_ASSIGN",
  "newStatus": "PENDING_PAS",
  "nextApprovalStep": "PAS"
}
```

The API loads `formTypeCode`, `willReturn`, vehicle usage, and the requester's
trip type from the stored request. Client-supplied copies are not authoritative.
Company-vehicle routes end digitally at PAS. The President is the final physical
signatory on the printed form and is not a new digital approval step.

### POST `/approvals/{requestId}/reject`

Request:

```json
{
  "reason": "Incomplete purpose details"
}
```

## Security Scanner

### GET `/security/queue`

Returns currently scannable gate passes:

- Approved and waiting for Time Out
- Outside and waiting for Time In

### POST `/security/scans`

Request:

```json
{
  "qrToken": "token-from-qr",
  "manualGatePassNo": null
}
```

Response examples:

```json
{
  "result": "TimeOutRecorded",
  "message": "Time Out recorded successfully.",
  "requestStatus": "Outside",
  "actualOutAt": "2026-06-17T13:05:00+08:00"
}
```

```json
{
  "result": "AlreadyCompleted",
  "message": "This QR code has already been completed."
}
```

Backend should determine the next action. The guard should not manually choose Time Out or Time In.

## Fleet

### GET `/vehicles`

Returns vehicles and current availability.

### POST `/vehicles`

System Admin or PAS / HR creates a vehicle record.

### PUT `/vehicles/{id}`

Updates vehicle details.

### DELETE `/vehicles/{id}`

Archives a vehicle record.

### GET `/drivers`

Returns drivers.

### POST `/drivers`

Creates a driver record. Drivers do not need login accounts by default.

## Admin

### GET `/users`

System Admin user list.

### POST `/users`

Creates user with role, department, position, date hired, and default password workflow.

### PUT `/users/{id}`

Updates user profile, department, position, and role.

### POST `/users/{id}/archive`

Archives inactive user.

### GET `/roles`

Returns roles and permissions.

### GET `/departments`

Returns departments.

## Files And Signatures

### POST `/files/signatures`

Uploads a signature image and returns file metadata.

Request: `multipart/form-data`

Response:

```json
{
  "id": 22,
  "fileName": "signature.png",
  "contentType": "image/png",
  "url": "/api/files/signatures/22"
}
```

### GET `/files/signatures/{id}`

Returns signature image if the current user is allowed to view it.

## Reports And Audit

### GET `/reports/gate-pass-summary`

Filters:

- `fromDate`
- `toDate`
- `departmentId`
- `status`

### GET `/audit-logs`

System Admin only. Returns immutable user/action/entity logs.
