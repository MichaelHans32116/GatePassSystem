# Database Migrations

Future database changes belong here as ordered scripts:

```text
001_initial_schema.sql
002_gate_pass_lifecycle_timestamps.sql
003_phase5_workflow_defaults.sql
004_notifications.sql
```

`Database/schema.sql` remains the canonical clean-install schema during early
development. Once the first deployed company database exists, every subsequent
change must use a migration script and preserve existing data.

- `007_department_access_shared_pas.sql`: splits Finance, HR, and IT, adds
  manager requestable departments, and prepares the shared PAS workflow.
- `018_vehicle_trip_type_and_split_reservations.sql`: adds HRAD trip type persistence and allows
  multiple reservation windows per gate pass for straight/split schedules.
