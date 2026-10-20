# MySaji owner progress update

**As of 19 October 2026**

**Local engineering update — 20 October:** The dependency and lockfile issue described below has now been repaired on `infra/reconcile-20261015`. The latest source passes frozen install, Prisma validation/generation, TypeScript, lint (0 errors; 54 warnings), unit tests (6 passed; 1 database integration test skipped), Next.js production build and local Docker image build. The container was smoke-tested without external networking and correctly reported database-unavailable health because no database was attached. Synthetic staging Compose validation also passed. These results are local preparation only: no VPS deployment or database migration occurred, and the commits are not visible on GitHub until pushed.

The retained VPS `vmi3668179` is still not accessible through verified SSH, so Dokploy, private access, server synchronization, backups and restore testing remain incomplete. Preserve the VPS; do not reinstall.

The public apex website is live at **https://mysaji.com** on Vercel. A fresh check on 19 October at 20:40 UTC returned HTTP 200 for both the homepage and `/api/health`. `www.mysaji.com` returned Cloudflare HTTP 521. The apex response still sets the Auth.js callback URL to `https://saji-3.vercel.app`, so custom-domain sign-in still needs configuration and a fresh login test. These checks verify the Vercel-hosted site, not a deployment to the VPS.

The MySaji GitHub repository is configured as this checkout's origin. GitHub had a newer `origin/main` commit (`7483f0a`) than the earlier local checkpoint. To preserve both, the original local `main` remains intact and a separate local reconciliation branch, `infra/reconcile-20261015`, now contains the remote source plus the infrastructure work. It has not been pushed or deployed. Previous local build, TypeScript, Docker, and synthetic PostGIS restore/connectivity checks passed; synthetic Dokploy Compose validation shows no published app/database ports and a private DB network. The new source revision could not be installed or tested: `pnpm-workspace.yaml` overrides `next-auth` to `^5.0.0`, which has no matching stable registry version, and frozen install also reports lockfile/override mismatch. No customer database was migrated.

The owner reports that VNC reaches the Ubuntu console on VPS `vmi3668179` (`169.58.242.133`), but the console remains at the login prompt and root access has not been established after multiple credential resets. The host and Dokploy status remain unverified. A support request was drafted, but submission is not confirmed. Preserve the existing server and data; do not reinstall. No server software or firewall changes have been made.

## Items still in progress

- `www.mysaji.com` returned **HTTP 521** on 19 October. Set its record to the exact target Vercel provides for `www`, initially with Cloudflare proxy disabled, then verify HTTPS.
- The apex response still sets the Auth.js callback URL to `https://saji-3.vercel.app`. Set the required Auth.js production URL variables in Vercel to `https://mysaji.com`, redeploy, and verify sign-in redirects/callbacks.
- Connect and validate the Vercel deployment configuration. This local checkout has no linked Vercel project or CLI access, so those settings could not be changed here.
- The local reconciliation branch is clean and 10 commits ahead of the locally recorded `origin/main`; it has not been pushed or deployed. Resolve the Auth.js workspace override (`next-auth: ^5.0.0`) and lockfile mismatch with the source owner before validating the new source baseline.
- After support restores verified VPS access, inspect the host read-only before Dokploy installation, private Isaac/Oliver accounts, WireGuard, firewall rules, database migration rehearsal, off-server backups, or restore verification.
- Review the newly fetched source update and its Prisma baseline/payment-settlement migrations; do not apply them to the existing database until an isolated rehearsal and source-database comparison are complete.
- Work ownership: Isaac leads backend/API, database and infrastructure; Oliver leads source handover, frontend, content/branding and frontend integration. Keep the current integrated Next.js application operational while Django is developed and connected incrementally.
- Source-owner action before reconciliation validation: resolve the invalid `next-auth` workspace override and refresh the lockfile intentionally; review the resulting auth version change before running/publishing the branch.

## Next actions

1. Ask Contabo support to restore root console access while preserving the VPS and its data. Verify host identity, then inspect the running server before changes.
2. Fix and test Vercel custom-domain authentication and the `www` DNS target. Preserve MX/SPF records.
3. Resolve the Auth.js dependency/lockfile mismatch with the source owner and validate the reconciled branch.
4. Continue protected staging, private access and backup/restore work after host inspection and source validation.

Passwords, API tokens, SSH/VPN private keys, and recovery codes are not included in this report. Share them individually using the approved password manager or secure channel.

See [DEPLOYMENT_REPORT.md](DEPLOYMENT_REPORT.md) for the owner-ready deployment and infrastructure report with current evidence.
