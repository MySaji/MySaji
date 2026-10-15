# MySaji owner progress update

**As of 15 October 2026, 20:47 UTC**

The core foundation is in place, and the public apex website is live at **https://mysaji.com**. The latest check independently confirmed that the apex resolves directly to Vercel IP addresses and returns **HTTP 200**. The app's `/api/health` also returned **HTTP 200** with `status: ok` and `database: ok`. Cloudflare remains authoritative for DNS; these web record changes were made outside this session.

The MySaji GitHub repository is configured as this checkout's origin. Local DevOps documentation and preparation are committed locally and have not been pushed. The last recorded `origin/main` is `98da6d5`; check the local Git log for the current ahead count. The working tree was clean before this update. Local build, TypeScript, Docker, and synthetic PostGIS restore/connectivity checks passed. A synthetic Dokploy Compose render also confirms no published app/database ports and a private internal DB network. No customer database was migrated.

The VPS owner reports that the server is up. SSH on port 22 responds, but the available root key is rejected, so server services and Dokploy status are not yet independently verified. The host key seen during connection must be compared with the Contabo console before reuse. No VPS or firewall changes have been made.

## Items still in progress

- `www.mysaji.com` currently resolves through Cloudflare and returns **HTTP 521**. Set the `www` record to the exact target Vercel provides for `www`, with Cloudflare proxy disabled, then verify HTTPS.
- The apex response still sets the Auth.js callback URL to `https://saji-3.vercel.app`. Set `AUTH_URL` and `NEXTAUTH_URL` in the Vercel production environment to `https://mysaji.com`, redeploy, and verify sign-in redirects/callbacks.
- Connect and validate the Vercel deployment configuration. This local checkout has no linked Vercel project or CLI access, so those settings could not be changed here.
- VPS SSH on port 22 responds, but authentication as root with the available key is rejected (`Permission denied (publickey,password)`). Restore named/key access and inspect the VPS read-only. Then complete Dokploy installation/status review, private Isaac/Oliver accounts, WireGuard, firewall rules, database migration rehearsal, off-server backups, and restore verification.
- Confirm whether the local infrastructure commit should be pushed after the source baseline and repository permissions are confirmed.

## Next actions

1. In Vercel, set production `AUTH_URL` and `NEXTAUTH_URL` to `https://mysaji.com`, redeploy, and test login.
2. In Cloudflare, update the existing `www` record to the exact record shown by Vercel; set it to DNS only. Preserve MX/SPF. Check the Vercel dashboard for the required redirect/domain status.
3. Restore SSH access through Contabo console/public-key onboarding and verify the host fingerprint; inspect the running server before making changes.
4. Review and push the two local commits after confirming the intended source baseline; continue staging and private-access work without using production customer data.

Passwords, API tokens, SSH/VPN private keys, and recovery codes are not included in this report. Share them individually using the approved password manager or secure channel.
