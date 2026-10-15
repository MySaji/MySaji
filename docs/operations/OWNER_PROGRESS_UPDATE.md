# MySaji owner progress update

**As of 16 October 2026**

The core foundation is in place, and the public apex website is live at **https://mysaji.com**. The latest check independently confirmed that the apex resolves directly to Vercel IP addresses and returns **HTTP 200**. The app's `/api/health` also returned **HTTP 200** with `status: ok` and `database: ok`. Cloudflare remains authoritative for DNS; these web record changes were made outside this session.

The MySaji GitHub repository is configured as this checkout's origin. GitHub had a newer `origin/main` commit (`7483f0a`) than the earlier local checkpoint. To preserve both, the original local `main` remains intact and a separate local reconciliation branch, `infra/reconcile-20261015`, now contains the remote source plus the infrastructure work. It has not been pushed or deployed. Previous local build, TypeScript, Docker, and synthetic PostGIS restore/connectivity checks passed; synthetic Dokploy Compose validation shows no published app/database ports and a private DB network. The new source revision could not be installed or tested: `pnpm-workspace.yaml` overrides `next-auth` to `^5.0.0`, which has no matching stable registry version, and frozen install also reports lockfile/override mismatch. No customer database was migrated.

The VPS owner reports that the server is up. SSH on port 22 responds, but the available root key is rejected, so server services and Dokploy status are not yet independently verified. The host key seen during connection must be compared with the Contabo console before reuse. No VPS or firewall changes have been made.

## Items still in progress

- `www.mysaji.com` currently resolves through Cloudflare and returned **HTTP 521** in the latest check (the supplied PDF's earlier 403 result is superseded). Set the `www` record to the exact target Vercel provides for `www`, with Cloudflare proxy disabled, then verify HTTPS.
- The apex response still sets the Auth.js callback URL to `https://saji-3.vercel.app`. Set `AUTH_URL` and `NEXTAUTH_URL` in the Vercel production environment to `https://mysaji.com`, redeploy, and verify sign-in redirects/callbacks.
- Connect and validate the Vercel deployment configuration. This local checkout has no linked Vercel project or CLI access, so those settings could not be changed here.
- VPS SSH on port 22 responds, but authentication as root with the available key is rejected (`Permission denied (publickey,password)`). Restore named/key access and inspect the VPS read-only. Then complete Dokploy installation/status review, private Isaac/Oliver accounts, WireGuard, firewall rules, database migration rehearsal, off-server backups, and restore verification.
- Confirm whether the local infrastructure commit should be pushed after the source baseline and repository permissions are confirmed.
- Review the newly fetched source update and its Prisma baseline/payment-settlement migrations; do not apply them to the existing database until an isolated rehearsal and source-database comparison are complete.
- Work ownership: Isaac leads backend/API, database and infrastructure; Oliver leads source handover, frontend, content/branding and frontend integration. Keep the current integrated Next.js application operational while Django is developed and connected incrementally.
- Source-owner action before reconciliation validation: resolve the invalid `next-auth` workspace override and refresh the lockfile intentionally; review the resulting auth version change before running/publishing the branch.

## Next actions

1. In Vercel, set production `AUTH_URL` and `NEXTAUTH_URL` to `https://mysaji.com`, redeploy, and test login.
2. In Cloudflare, update the existing `www` record to the exact record shown by Vercel; set it to DNS only. Preserve MX/SPF. Check the Vercel dashboard for the required redirect/domain status.
3. Restore SSH access through Contabo console/public-key onboarding and verify the host fingerprint; inspect the running server before making changes.
4. Review and push the two local commits after confirming the intended source baseline; continue staging and private-access work without using production customer data.

Passwords, API tokens, SSH/VPN private keys, and recovery codes are not included in this report. Share them individually using the approved password manager or secure channel.
