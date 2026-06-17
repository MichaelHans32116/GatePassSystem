# Frontend SRC

Proposed module layout:

```text
SRC/
  app.js
  config/
  components/
  pages/
  services/
  state/
  utils/
  styles/
```

Responsibilities:

- `components`: reusable UI parts like sidebar, topbar, toast, tables, print form, QR, signature pad.
- `pages`: screen-level modules like login, dashboard, apply gate pass, approvals, scanner, and admin pages.
- `services`: API clients only. No DOM rendering.
- `state`: session and temporary client state while migrating from the prototype.
- `utils`: date/time formatting, validators, DOM helpers, and status formatting.
