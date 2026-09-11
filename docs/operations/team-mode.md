# Team Mode Operations & Deployment

## Overview

Developer Toolbox is designed with an **anonymous, local-first default**. Team collaboration features are strictly opt-in and activated only when `TOOLBOX_TEAM_MODE=true` is set.

When Team Mode is enabled:
- An isolated SQLite database (`workspace.db`) is initialized with WAL journaling, busy timeout, and foreign keys.
- User identity is authenticated via OpenID Connect (OIDC) JWT ID tokens (`Authorization: Bearer <token>`).
- Roles are enforced at the service layer:
  - `viewer`: Can browse and read shared workspaces.
  - `editor`: Can create and update content within shared workspaces.
  - `admin`: Can manage workspace members, audit trails, and global content pack activation.

## Required Environment Variables

| Variable | Description | Default / Example |
| --- | --- | --- |
| `TOOLBOX_TEAM_MODE` | Set to `true` to enable team mode | `false` |
| `TOOLBOX_OIDC_ISSUER` | Expected OIDC issuer URL (`iss` claim) | `https://auth.company.internal` |
| `TOOLBOX_OIDC_AUDIENCE` | Expected audience (`aud` claim) | `developer-toolbox` |
| `TOOLBOX_OIDC_CLIENT_ID` | Client ID if separate from audience | Optional |
| `TOOLBOX_TEAM_DB_PATH` | Path to persistent team SQLite database | `/var/lib/toolbox/workspace.db` |

## Deployment with Docker Compose

To start the team-mode instance:

```bash
docker compose --profile team up -d toolbox-team
```

The team instance will start on port `8081` bound to loopback `127.0.0.1`. In production deployments behind a reverse proxy (e.g. Nginx, Traefik, or Caddy), configure HTTPS termination and pass standard `Authorization` headers.
