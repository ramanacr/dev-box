# Security Policy

## Supported versions

Security fixes are applied to the most recent minor release. Older releases do not
receive backports.

| Version | Supported |
| ------- | --------- |
| Latest minor | Yes |
| Any earlier release | No |

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report privately through [GitHub Security Advisories][advisories], which creates a
channel visible only to you and the maintainers.

[advisories]: https://github.com/ramanacr/dev-box/security/advisories/new

Please include the version or commit you tested, the configuration in use
(anonymous localhost, team mode, or which extensions were enabled), reproduction
steps, and what an attacker gains. A proof of concept helps but is not required.

### What to expect

| Stage | Target |
| ----- | ------ |
| Acknowledgement of your report | 3 business days |
| Initial assessment and severity | 10 business days |
| Fix released for critical severity | 30 days |
| Fix released for high severity | 60 days |

We will tell you when the fix ships and credit you in the advisory unless you ask
us not to. If a report turns out to be out of scope we will explain why rather
than closing it silently.

## Scope

The toolbox is local-first. Its default profile binds loopback, runs anonymously,
and processes everything you paste in the browser. That shapes what counts as a
vulnerability.

**In scope**

- Remote code execution, path traversal, or container escape from any endpoint
- Authentication bypass or token forgery in team mode (`TOOLBOX_TEAM_MODE=true`)
- Authorization bypass — reading or modifying a workspace you are not a member of
- Cross-site scripting, or any bypass of the Content Security Policy
- SQL injection against the documentation packs or the workspace database
- Leakage of pasted content off the machine through any code path
- Vulnerabilities in the published container image or its dependencies

**Out of scope**

- Attacks requiring a pre-compromised host or the operator's own shell access
- Exposing the server on a public interface by overriding `TOOLBOX_BIND_ADDRESS`
  and publishing the port. The loopback default is deliberate; overriding it is an
  operator decision documented in `Dockerfile` and `compose.yaml`.
- Denial of service by a locally authenticated user against their own instance
- Missing hardening headers with no demonstrated exploit
- Findings from automated scanners without a working reproduction

## Security design

Background on the security model lives in the repository:

- `docs/security/threat-model-phase-1.md` — core local profile
- `docs/security/threat-model-phase-3.md` — team mode and identity
- `docs/security/ai-data-flow.md` — what the AI extension sends, and where
- `docs/adr/0006-content-security-policy-style-src.md` — the CSP decision
