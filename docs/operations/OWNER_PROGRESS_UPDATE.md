# MySaji owner progress update

**As of 15 October 2026**

The core foundation is in place, and the public apex website is now live at **https://mysaji.com**. This session independently confirmed that the apex resolves to Vercel IP addresses and returns **HTTP 200** from Vercel. Cloudflare is still authoritative for the zone. The DNS change was made outside this session; we did not alter DNS.

The MySaji GitHub repository is configured as this checkout's origin. The local DevOps preparation is committed as `a4e1b2f`; it is not yet pushed to GitHub. Local build, TypeScript, Docker, and synthetic PostGIS restore/connectivity checks passed. No customer database was migrated.

The VPS owner reports that the server is up. SSH on port 22 responds, but the available root key is rejected, so server services and Dokploy status are not yet independently verified. No VPS or firewall changes have been made.

## Items still in progress

- `www.mysaji.com` currently resolves through Cloudflare and returns **HTTP 521**. Set the `www` record according to the Vercel project's own domain instructions, with Cloudflare proxy disabled, then verify HTTPS.
- The apex response currently sets the Auth.js callback URL to `https://saji-3.vercel.app`. Set `AUTH_URL` and `NEXTAUTH_URL` in the Vercel production environment to `https://mysaji.com`, redeploy, and verify sign-in redirects/callbacks.
- Connect and validate the Vercel deployment configuration. This local checkout has no linked Vercel project or CLI access, so those settings could not be changed here.
- Restore named SSH access and inspect the VPS read-only. Then complete Dokploy installation/status review, private Isaac/Oliver accounts, WireGuard, firewall rules, database migration rehearsal, off-server backups, and restore verification.
- Confirm whether the local infrastructure commit should be pushed after the source baseline and repository permissions are confirmed.

## Next actions

1. In Vercel, set production `AUTH_URL` and `NEXTAUTH_URL` to `https://mysaji.com`, redeploy, and test login.
2. In Cloudflare, update the existing `www` record to the exact record shown by Vercel; set it to DNS only. Preserve MX/SPF. Check the Vercel dashboard for the required redirect/domain status.
3. Add the authorized SSH public key through Contabo and verify the host fingerprint; inspect the running server before making changes.
4. Push the reviewed local commit only after confirming it is the intended repository baseline; continue staging and private-access work without using production customer data.

Passwords, API tokens, SSH/VPN private keys, and recovery codes are not included in this report. Share them individually using the approved password manager or secure channel.
