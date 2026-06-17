# Frontend

The current UI prototype still lives at the repository root as `index.html`.

Target frontend direction:

- Plain HTML/CSS/JavaScript modules first.
- Tailwind-based styling following the MPI server-style layout.
- Separate pages, components, services, state, and utilities.
- Frontend role-based navigation for usability only. Backend authorization remains the real protection.

Suggested migration flow:

1. Move visual shell into reusable `sidebar`, `topbar`, `toast`, and `modal` components.
2. Move each section into one page module.
3. Move mock data into temporary frontend state modules.
4. Replace temporary state with API services.
5. Delete quick-login test buttons before production.
