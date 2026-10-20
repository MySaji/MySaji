# MySaji deployment and infrastructure report

**Status checked: 19 October 2026, 20:40 UTC**

## Local implementation update (20 October 2026)

The reconciled source dependency issue is now repaired locally. pnpm 11.15.1 frozen install, Prisma validation/generation, independent TypeScript, lint, unit tests, production build, Docker image build, isolated container startup, and synthetic Dokploy Compose validation passed. Lint reported 54 warnings; tests skipped one PostgreSQL integration test because no test database was configured. Docker health returned 503 in the isolated smoke test because no database was attached, as expected. The image is built locally and has not been deployed to the VPS.

These changes are on local branch `infra/reconcile-20261015` and are not yet visible on GitHub until the branch is pushed. VPS access remains unresolved, so Dokploy installation and server synchronization have not happened. The October 19 public-site, DNS and authentication observations below are historical checks and were not refreshed as part of this local build validation.

## Current service status

The public apex site, **https://mysaji.com**, is responding from **Vercel**. A live HTTPS request returned HTTP 200 at 20:40 UTC. The deployed `/api/health` endpoint also returned HTTP 200. These checks confirm the current Vercel-hosted site and health route; they do not confirm a deployment to the Contabo VPS.

`https://www.mysaji.com/` returned **Cloudflare HTTP 521** during the same check. The apex response still sets the Auth.js callback URL to `https://saji-3.vercel.app`; production sign-in on the custom domain therefore still needs configuration and a fresh login test.

## VPS and DevOps status

The retained VPS is `vmi3668179` (`169.58.242.133`, Ubuntu 24.04 per owner). The owner reports that VNC reaches the Ubuntu console, but the console is at the `login:` prompt and root access has not been established after multiple credential resets. No service inventory, Dokploy status, firewall review, or host changes have been verified. A support request has been drafted but is not confirmed submitted.

As a result, self-hosted Dokploy, named SSH accounts, Isaac and Oliver WireGuard profiles, private PostgreSQL/PostGIS, staging deployment, off-server backups, and restore verification remain **not completed or not verified**. The VPS must be inspected before installing or modifying services. Do not reinstall: existing workloads and data have not been inventoried.

## Source and local preparation

The MySaji repository origin is `https://github.com/MySaji/MySaji.git`. The current local branch is `infra/reconcile-20261015`; the working tree was clean at report time and the branch is 10 commits ahead of the locally recorded `origin/main`. The branch has not been pushed or deployed.

The reconciled source revision has a dependency blocker: the workspace overrides `next-auth` to `^5.0.0`, which does not resolve to a matching stable release, and the frozen install also reports a lockfile/override mismatch. The source owner must resolve the intended Auth.js version and refresh the lockfile before the new baseline can be validated. Earlier build, type-check, container, and synthetic PostGIS restore checks apply to the earlier source baseline only; they are not evidence that this reconciled revision is production-ready.

## Owner responsibilities and next actions

- **Isaac:** backend/API, database, Docker/Dokploy, server security, VPN and backups.
- **Oliver:** source handover, frontend, content/branding and frontend integration.
- **Together:** keep the integrated Next.js application working while the Django/API migration is planned and tested incrementally; do not make competing schema changes or migrate production without a rehearsal and release decision.

1. Ask Contabo support to restore root console access while preserving the VPS and its data. Confirm the server identity through the provider console before authenticating over SSH. Do not share passwords or private keys in chat or repository files.
2. After access is restored, inspect running workloads, Docker/Swarm, ports, storage, firewall and capacity read-only. Back up affected configuration before any approved change.
3. Correct and verify Vercel custom-domain authentication, then fix the `www` domain using the exact Vercel-provided DNS target. Preserve MX/SPF and other mail records.
4. Resolve the dependency/lockfile issue with the source owner and run validation on the reconciled revision.
5. Continue with protected Dokploy staging, private access, migration rehearsal and off-server backup/restore evidence only after the VPS inspection.

No passwords, API tokens, private SSH/VPN keys, database credentials or recovery codes are included in this report.
