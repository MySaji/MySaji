# MySaji DevOps execution record

Updated 2026-10-15. **Latest web DNS request: Vercel for mysaji.com apex (not yet applied); Dokploy self-hosted preparation remains available for the VPS. See the Vercel section at the end and DOKPLOY_SETUP.md. The earlier Caddy Compose is an alternative only and must not be started alongside Dokploy Traefik.** Local source: `98da6d571990fbbdb70aace49c886f7da4410036` (use `git rev-parse HEAD` for authoritative full hash). No server deployment or DNS mutation was performed by this session. The latest owner update reports DNS now routes the apex to Vercel; independent verification is recorded below.

## Verified baseline

- Origin fetch/push: https://github.com/MySaji/MySaji.git. Main tracked origin/main at `98da6d5`, subject `geofencing`; working tree initially clean. No fetch was performed; remote freshness is not independently established.
- Organization creation and transfer are completed prerequisites; do not repeat them.
- No CLAUDE.md or AGENTS.md found in project; no applicable ancestor AGENTS.md found in inspected home/project paths.
- One integrated Next.js 16.0.10 / React 19.2 application: app routes, backend server actions, Auth.js beta.31, Prisma 6.19.3 and PostgreSQL. Keep these together.
- pnpm lockfile format 9. Installed with `corepack pnpm@10.11.0 install --frozen-lockfile --ignore-scripts`; succeeded. Added packageManager pin, lockfile unchanged. Local Node v24.21.0; Docker runtime uses Node 24 Debian/OpenSSL 3.
- Root postinstall generates Prisma; postbuild originally invoked an EMPTY prepare-standalone.js; now populated to copy public/static assets and fail if required standalone output is absent. No migrations or seeds were run. Prisma generation was explicitly run and succeeded after installation. Dependencies were installed without their lifecycle scripts.
- Existing Next config ignores TypeScript errors. Independent type checking is required. Existing lint command fails: `eslint: not found`. No conventional automated test suite found.
- Ten tracked manual SQL files exist under backend/prisma/migrations/manual. README explicitly says db push was used, SQL is historical evidence, and there is no replayable migration history. Never run migrate deploy assuming these are migrations.
- README frontend-only description is stale; ARCHITECTURE.md and actual source describe the integrated full-stack app. Older October 9 audit explicitly reports four dirty files and one untracked SQL file. This checkout alone cannot establish their inclusion.

## Blocked / pending

| Item | Status and next evidence |
|---|---|
| Original developer baseline | BLOCKED: obtain confirmation plus original worktree diff/untracked-file inventory and SQL execution ledger; reconcile against this commit. |
| VPS | User supplied vmi3668179, 169.58.242.133. User confirms Ubuntu 24.04, 6 vCPU, 12 GB RAM, 200 GB SSD and Contabo Auto Backup. SSH user/key onboarding and existing workloads remain unverified. Inspect before changing anything. |
| Cloudflare account status | Public delegation/proxy answers observed; authenticated dashboard/API active status and origin-record export still required. |
| Database migration | Source version, complete schema/roles/policies/objects/data and application encryption key unavailable; no rehearsal or cutover performed. |
| Runtime validation | Container build, HTTP health against isolated DB, spatial queries, scheduler delivery and restore drill required before release. |
| Email | Existing Namecheap forwarding preserved; client must confirm intended mailbox/SMTP service. |
| Off-server backups | Destination, credentials, independent key custody, retention, RPO/RTO and alert recipient pending. Proposed daily backup: RPO 24h, target RTO 4h, subject to measured restore and client acceptance. |
| Production release | Explicit live cutover authorization required. Infrastructure completion is not application feature certification. |

## DNS evidence and proposed change

Read-only lookups on October 15: `.com` parent delegates to destiny.ns.cloudflare.com and nitin.ns.cloudflare.com. Recursive NS agrees; authoritative SOA answered from destiny. Public A: 104.21.63.208, 172.67.150.93. AAAA: 2a06:98c1:3121::6, 2a06:98c1:3120::6. These are proxy addresses, not the origin. www CNAME lookup returned no visible answer; flattened/proxied records cannot reveal the stored target. HTTPS HEAD timed out after 15 seconds; application availability was not verified.

MX observed: priority 10 eforward1/2/3.registrar-servers.com; priority 15 eforward4.registrar-servers.com; priority 20 eforward5.registrar-servers.com. TXT: `v=spf1 include:spf.efwd.registrar-servers.com ~all`.

Last supplied origin records (not independently visible through proxy): apex A 162.255.119.225, proxied; www CNAME parkingpage.namecheap.com, proxied. Export record IDs, exact values, proxy flags, TTLs, SSL mode and any AAAA/CAA records from Cloudflare before change. Preserve MX/TXT.

After host ownership/access and origin readiness are verified, proposed web-only changes: apex A -> **169.58.242.133**; www CNAME -> **mysaji.com**, proxied. This is a supplied candidate IP, not yet a verified origin. Do not apply now. Review any stored origin AAAA for stale targets without confusing Cloudflare-generated AAAA with configured origin records.

Provision valid origin certificates before switching traffic: use a temporary staging hostname or controlled DNS-01 issuance; default Caddy HTTP ACME cannot validate mysaji.com while DNS still points elsewhere. Mount a pre-issued certificate via a reviewed Caddy configuration if using DNS-01. Verify with `curl --resolve mysaji.com:443:169.58.242.133 https://mysaji.com/api/health` and repeat for www, with proper CA trust and no `-k`. Set Cloudflare Full (strict), never Flexible. Then authorize/schedule cutover, update web records, verify TLS/redirects/login/static assets/callbacks, monitor errors.

DNS rollback: restore exported web records/TTL/proxy flags and previous compatible SSL configuration; do not touch email. Restoring parking is only routing rollback, not application recovery. Keep previous application host available until acceptance. DNS rollback does not undo writes or migrations.

## Architecture decisions

| Decision | Reason | Alternative / consequence |
|---|---|---|
| One non-root Node container | Matches existing Next server actions and standalone output | Splitting services would change application architecture and is out of scope |
| PostgreSQL 17/PostGIS candidate | Prior audit reports PG17; source queries require extensions.ST_* | Verify live major/extensions first; choose matching version before restore |
| Internal DB network; no DB/app published ports | Removes direct internet reachability | Developers access isolated development DB over VPN; no public 5432/3000 |
| Caddy on 80/443 | TLS renewal, reverse proxy and streaming without separate frontend | Nginx plus external ACME also viable; Caddy certificate bootstrap still needs verified DNS |
| Separate database owner/application role | App cannot create roles/databases or own migrations | Owner credential used only in reviewed maintenance sessions |
| PostgreSQL volume + Caddy volumes | Preserve database and certificates across replacements | Backups remain independent of local volume durability |
| Restic off-server encrypted backup | Recover DB and indispensable encryption keys after host loss | Managed backup also viable; provider snapshots alone are insufficient |
| Jobs profile disabled by default | Existing digest routes can email real people | Enable exactly one scheduler only after sandbox rehearsal and approval |

Compose resource caps are provisional: app 2GiB/2CPU, DB 3GiB/2CPU, proxy 256MiB, jobs 128MiB. Confirm purchased plan and leave OS/build headroom; build off-host if necessary. Pin tested image digests before release; current tags are candidates, not immutable approvals.

## Supabase / storage inventory

Source uses Auth.js credentials/conditional Google OAuth and Prisma models, not an observed Supabase Auth SDK. No Supabase SDK dependency or Realtime client was found; chat/signaling includes polling. Source does reference a Supabase Storage public email-assets/logo.png URL in backend/services/email-templates.ts. Uploaded photos/KYC can be base64 strings stored in database fields; inspect all URL-bearing fields and sizes. No application filesystem upload writer was found in the targeted scan; maintenance scripts write local backup files.

These source observations do not prove absence of live Supabase dependencies. Before migration export inventory of auth users/identities, storage buckets/objects/access rules, realtime publications, edge functions/secrets/schedules, extensions, schemas, triggers, custom functions, roles, grants, RLS policies and event triggers. Reconcile owner/role mapping for a vanilla PostgreSQL restore; do not blindly import Supabase service roles. Download/copy authorized objects and compare count/bytes/checksums; preserve existing URLs or implement and test replacements. Public logo must remain available or be migrated. Back up PAYMENT_METHOD_ENCRYPTION_KEY separately and preserve its value; generating a new key strands existing encrypted payment fields.

## Local implementation

Dockerfile builds locked dependencies without lifecycle scripts, explicitly generates Prisma, builds standalone, copies public/static assets, and runs as node. No secrets or dumps are in the build context. NEXT_PUBLIC_* values are build-time public settings; never put a secret there. Runtime config examples live under ops, actual files are ignored. Build does not require a real database or payment credentials; a build-time DB dependency must be reported, not satisfied with production access.

ops/compose.yaml publishes only proxy 80/443. Database initialization only affects a new volume. It moves fresh-image spatial extension setup to extensions, creates a distinct app login and default grants for objects later created by saji_owner. Reconcile grants explicitly after restore because restored owners can differ. No schema push, migration, seeds or backfills are attached to startup.

ops/scheduler.mjs reproduces UTC schedules from vercel.json: story expiration daily 02:00, email digest Monday 08:00, subscriber digest Monday 09:00. It authenticates with CRON_SECRET, prevents overlapping local runs, logs HTTP failure and does not automatically retry potentially delivered emails. No catch-up/durable exactly-once guarantee; restarts can miss or duplicate a minute. Inspect route-level idempotency, monitor execution and keep one instance. Reconcile and disable any old Vercel scheduler before enabling jobs profile.

See DEVOPS_RUNBOOK.md for host inspection, migration, release, backup, restore and developer access.

## Reference basis

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting) and [Docker deployment](https://docs.docker.com/guides/nextjs/) support the standalone packaging approach.
- [Docker firewall behavior](https://docs.docker.com/engine/network/packet-filtering-firewalls/): published traffic may bypass UFW; host INPUT rules alone are insufficient.
- [Cloudflare zone status](https://developers.cloudflare.com/dns/zone-setups/reference/domain-status/): authoritative DNS answers alone do not prove active dashboard state.

## Validation evidence

- Frozen dependency install: exit 0, pnpm 10.11.0, committed lockfile unchanged. Explicit Prisma generation: exit 0.
- Existing production build (`npm run build`): exit 0; standalone/server.js produced and 238 routes processed. It logs failed platformSetting queries against synthetic build credentials, caught by the application. No production credentials were supplied. This success does not prove database-backed runtime behavior.
- Independent TypeScript after Prisma generation: exit 0 (`tsc --noEmit --incremental false`). The earlier concurrent check ran before client generation and is superseded by this result.
- Prisma validate with synthetic connection values: exit 0.
- Existing lint: exit 127, eslint not installed. This remains unresolved; no successful lint claim.
- Build warnings: middleware convention deprecated, stale baseline-browser-mapping data, OpenTelemetry require-in-the-middle external resolution. Validate Sentry instrumentation at runtime before release.
- Compose config with synthetic environment: exit 0. Shell/JavaScript syntax and git diff whitespace checks completed.
- Container build, fresh PostGIS initialization and complete restore drill: pending evidence below; no live deployment.

- Isolated fresh PostGIS test: PASS. Image digest sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6. Network disabled, data on tmpfs, synthetic secrets. postgis namespace=extensions; geographic distance query passed; saji_app rolsuper/rolcreatedb/rolcreaterole all false. Test container stopped; no persistent application volume used.
- Lockfile SHA-256 matches HEAD: 35175386bff6a5119a5fa40d7e04eb646a61ac3c4f2a9991e6bd5a3f33db6d29.
- Standalone asset-copy hook executed successfully. Initial standalone HTTP smoke test timed out without startup output; investigate runtime startup before release.

- Standalone retry: PASS startup (Next reports ready in 1.564s), health returned 503 with database unreachable using a deliberately unavailable synthetic database. Initial timeout was not reproduced. Test lacked AUTH_TRUST_HOST and logged UntrustedHost; production template explicitly sets AUTH_TRUST_HOST=true behind the private app/proxy network. This is failure-path readiness evidence only, not successful DB-backed feature validation.

## Dokploy continuation

- User selected stable Dokploy SELF-HOSTED, no paid subscription/trial. Only retained vmi3668179 / 169.58.242.133 is authorized. Excluded: 178.238.225.126, 169.58.243.109, 62.171.151.208. None contacted.
- Read-only SSH attempt reached retained host but stopped before authentication: no trusted ED25519 host key in known_hosts. No SSH alias exists; default local username is izach, not confirmed as server username. Existing local public key available at ~/.ssh/id_ed25519.pub. Need username, onboarding method and console-verified host fingerprint. No server inspection or installation claimed.
- Parent DNS still delegates to Cloudflare. deploy.mysaji.com A lookup returned no answer. Dashboard/API active-state verification remains pending. No DNS changes performed.
- Docker production image built successfully as saji:devops-local-validation, manifest sha256:e6b21e83502b83ab56967d012c570fd048ae30aea2ca62c1d4dff3dfa1edb00a. This build context predates the final standalone-hook edit; Docker explicitly copies static/public assets independently. Rebuild final release from reviewed changes.
- ops/compose.dokploy.yaml prepares staging without Caddy or published app/DB ports. Use Dokploy Compose mode and domain routing, separate secrets/volumes, sandbox settings, jobs disabled. Preview generated configuration and verify network isolation before deployment.
- Owner identity/onboarding, limited GitHub installation, DNS access, off-server destination and actual Dokploy configuration backup/restore remain pending. Contabo Auto Backup is user-confirmed, not independently verified and does not substitute for isolated restore evidence.

- Root username subsequently confirmed. Public-key authentication with ~/.ssh/id_ed25519 was rejected (publickey,password). First-use host key was recorded only in /tmp/saji-vmi3668179-known-hosts: SHA256:9wav+1ZCnxR5owau2pZxRzRdNO9LbJeTW9+VrXNV71k; not independently console-verified. Need user-run ssh-copy-id or console onboarding; no server commands executed.
- Official installer downloaded for review only, SHA-256 92749e5fe1678d1a2dc1e5bad193a1e113fcdbee3cf24193fc14ab85765b6b8a. It contains unconditional docker swarm leave --force and docker network rm -f dokploy-network, plus chmod 777 /etc/dokploy. Do NOT execute unchanged against an occupied host. Inspect state, use reviewed non-destructive manual steps, and preserve existing network/Swarm state.
- Dokploy Compose validates with placeholder environment (exit 0). Synthetic local dump/restore preserved 2 rows, sum 200.00, PostGIS extensions namespace. First app-to-DB check failed because test mounted mode-600 secret files under a nontraversable directory; init hook lacked a separate failing read. Fixed hook to abort on unreadable/empty password and documented individual file mount permissions. Retest required.

## Final local evidence after Dokploy selection

- Corrected secret-file retest PASS: isolated PostGIS dump restored into a separate empty database with --exit-on-error; 2 synthetic rows, exact amount sum 200.00, extension schema extensions. No customer data involved.
- Built application container health PASS: HTTP 200, status ok, database ok at 2026-10-15T16:09:19.558Z; restricted saji_app login used. Runtime UID 1000. No host ports published.
- Disposable application/database containers and internal network removed; test DB lived only in tmpfs. No production volume changed.
- Script syntax, Compose validation and git diff --check passed. Lint remains failed due to missing ESLint. All changes remain local/uncommitted.
- This demonstrates synthetic application database connectivity and logical restore mechanics, not a Supabase migration or Dokploy control-plane restore. Those still require verified SSH access, source baseline/data inventory, off-server backup destination and custodian onboarding.
- Next action: user runs ssh-copy-id -i ~/.ssh/id_ed25519.pub root@169.58.242.133 in their own terminal (password entered only there), or installs that public key through Contabo console. Compare server host fingerprint with console. Then retry strict pinned-host authentication and read-only ops/inspect-host.sh before changes.

## Self-hosted dashboard access follow-up

User clarified that the browser showed Dokploy Cloud onboarding and requested self-hosted installation detection before changes. Retried root SSH using the existing key and strict checking against the previously recorded host key; authentication again failed: Permission denied (publickey,password). No host inspection commands ran. Installation, listeners and dashboard address remain unverified. No subscription, trial, installation or DNS change was performed. Official self-hosted installation guidance was rechecked.

Immediate unblock: run `ssh-copy-id -i ~/.ssh/id_ed25519.pub root@169.58.242.133` in the user's own terminal, entering the checkout password only there; verify the host fingerprint through Contabo console. Then perform read-only host inspection before installation.

Once the self-hosted service is VERIFIED to listen on server loopback port 3000 and public registration is blocked, use `ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:13000:127.0.0.1:3000 root@169.58.242.133`, keep that terminal open, and visit http://127.0.0.1:13000. This is a prepared access path, not confirmation that a dashboard currently exists. https://deploy.mysaji.com remains a proposed hostname until DNS/TLS/access restrictions are configured and verified.

## Cloudflare duplicate-record report

User supplied current DNS dashboard text: apex A 162.255.119.225 proxied/Auto; www CNAME parkingpage.namecheap.com proxied/Auto; a failed attempted entry involving the incomplete value 0a60b57432f12b0d.vercel-dns-017. Cloudflare reported an existing A/AAAA/CNAME for that name. Do not infer a complete Vercel hostname or change the selected VPS deployment from this fragment. DNS Setup: Full identifies the DNS setup type, not the Full(strict) TLS setting or independent application readiness.

For the selected VPS path, update existing apex/www web records only after origin readiness and authorized cutover; do not create a duplicate www CNAME. Proposed deploy A 169.58.242.133 is a distinct dashboard name and still awaits verified Dokploy installation/TLS/access restrictions. Preserve MX/SPF. No DNS mutations performed. Public apex/www lookups still return Cloudflare proxy IPs and cannot verify the hidden origin target.

## Latest authorized web DNS target: Vercel apex

User supplied Vercel project DNS instructions and explicitly requested configuration: CNAME @ -> 0a60b57432f12b0d.vercel-dns-017.com. with proxy Disabled. This supersedes the earlier proposed VPS apex A target for the current web DNS task; it does not authorize unrelated server changes or a database cutover.

Exact change: edit the existing mysaji.com parking A (162.255.119.225, proxied, Auto) into a CNAME named @ targeting 0a60b57432f12b0d.vercel-dns-017.com, DNS only (grey cloud), TTL Auto. Do not add a second apex record. Keep MX/SPF and other DNS records unchanged; www has its own parking record and was not supplied separate Vercel instructions. Cloudflare supports apex CNAME flattening. After saving, refresh Vercel domain validation and verify public DNS/HTTPS/application response. Rollback the same record to prior A 162.255.119.225, proxied/Auto if needed; that restores parking, not application service.

Execution blocked on account access: no Cloudflare callable connector; plugin search returned no Cloudflare plugin; standard DNS API token/zone environment variables are absent. No DNS mutations performed and no Vercel configuration success claimed. User can make this exact edit in the open Cloudflare dashboard.

## Private-access request resumed

- User requested separate Isaac/Oliver WireGuard peers, Linux accounts, Dokploy logins, private administration, Remote SSH and non-secret handover. `docs/operations/PRIVATE_ACCESS.md` now records intended access and verification gates. WireGuard server/client examples contain placeholders only.
- SSH retried against the retained host with the existing key and strict known-host file; authentication still failed. No remote inventory, user, VPN, Dokploy or firewall change was possible. Requested console key onboarding and public keys/device labels only.
- Isaac key ownership/device not yet confirmed. Oliver public key/device pending. No guesses made about VPN subnet because host/VPC/Docker/client routes cannot be inspected yet.
- The latest DNS screenshot describes a Vercel apex CNAME request. It is independent of private access; public DNS wasn't changed in this task.

- Latest resume check (2026-10-15): TCP SSH to 169.58.242.133:22 now returns `Connection refused` before authentication. Previously it accepted SSH handshake but rejected the key. This indicates SSH is currently not listening/reachable at that address, or the host/provider firewall actively rejects it. No inspection commands ran. Do not keep retrying ssh-copy-id until SSH is reachable; check Contabo VPS power/status, assigned IP and provider firewall/console, then enable SSH through console or Contabo rescue workflow without disturbing workloads. Confirm host key again after any rebuild/recovery.

## Live-site outage: Cloudflare 522 (2026-10-15)

User reports browser response at mysaji.com: Cloudflare 522, Ray ID a4b08adaa831f4c0 at 2026-10-15 17:29:08 UTC. Browser and Cloudflare were working; origin timed out. Independent checks: apex DNS returned Cloudflare proxy IPv4 104.21.63.208 (and another query previously returned 172.67.150.93); apex AAAA returned Cloudflare IPv6. This proves requests are currently proxied. `curl -I https://mysaji.com` timed out from this environment; `www.mysaji.com` failed DNS resolution. Origin cannot be identified behind Cloudflare without dashboard record data. This aligns with the earlier parking A/proxied record and is not an application health check.

User-provided Vercel project record remains the exact intended apex target: CNAME `@` -> `0a60b57432f12b0d.vercel-dns-017.com.` with Proxy Disabled. Cloudflare rejected adding it because an apex A/AAAA/CNAME already exists. In the Cloudflare zone, remove/replace the conflicting web A record (last dashboard value was 162.255.119.225), then add the project-specific record exactly as Vercel shows, DNS only. Inspect and remove only conflicting apex A/AAAA/CNAME records; preserve MX, SPF/TXT and unrelated records. Do not point the website to the inaccessible VPS. After saving, verify Vercel marks domain valid, DNS-only response follows Vercel, and HTTPS returns the deployed app. www currently does not resolve in public DNS; configure it only according to its own Vercel Domains instruction, then verify or set the desired www/apex redirect. No DNS mutation was possible from this environment; the Cloudflare API credential/connector remains unavailable.


## Owner progress update and current live verification (2026-10-15)

See `docs/operations/OWNER_PROGRESS_UPDATE.md` for the shareable owner summary. Owner reports the server is up, Cloudflare is configured and repository setup is complete. This session independently confirmed `mysaji.com` resolves to Vercel IPv4 addresses 64.29.17.65 and 216.198.79.65 and returned HTTP/2 200 with `server: Vercel` at 17:47 UTC. The Vercel response sets Auth.js callback URL to `https://saji-3.vercel.app`, so production `AUTH_URL`/`NEXTAUTH_URL` need correction and redeployment. `www.mysaji.com` resolves to Cloudflare proxy addresses and returns HTTP 521; its record still needs to match the Vercel project instructions with proxy disabled. No Cloudflare or Vercel settings were changed from this session; local Vercel CLI/project linkage is absent.

Local `origin` remains https://github.com/MySaji/MySaji.git. Local HEAD is `a4e1b2f`, while the last locally recorded `origin/main` is `98da6d5`; local worktree is clean. Thus the DevOps commit has not been pushed. Owner reports VPS is up; latest SSH attempt reaches port 22 but root public-key authentication is denied. No VPS inspection or changes.

## Resume verification (2026-10-15 20:10 UTC)

- Apex DNS now resolves directly to Vercel: `64.29.17.65` and `216.198.79.65`. HTTPS returned HTTP/2 200 with `server: Vercel`.
- `https://mysaji.com/api/health` returned HTTP 200: `status: ok`, `database: ok`. This verifies the deployed health route/database connectivity only; it is not end-to-end feature or login validation.
- Apex response still sets `__Secure-authjs.callback-url` to `https://saji-3.vercel.app`. Production Auth.js URL configuration and a fresh deployment remain required before sign-in can be considered verified.
- `www.mysaji.com` resolves to Cloudflare proxy IPv4 addresses `104.21.63.208` and `172.67.150.93`, then returns HTTP/2 521. Use the exact `www` domain instruction from the Vercel project and keep the record DNS-only while validating. Do not change mail records.
- SSH to `root@169.58.242.133` reaches the server but authentication fails with `Permission denied (publickey,password)`. No remote inspection or mutations were possible.
- Local checkout was clean before this documentation update at `b5611fb`; last recorded `origin/main` is `98da6d5`. The two local commits (`a4e1b2f`, `b5611fb`) remain unpushed. No remote fetch/push was performed.

## Infrastructure continuation check (2026-10-15 20:47 UTC)

- Current live check: `https://mysaji.com` returns HTTP/2 200 from Vercel and `/api/health` returns `status: ok`, `database: ok`. The Auth.js callback cookie still points to `https://saji-3.vercel.app`. `www.mysaji.com` still returns Cloudflare HTTP 521. Website is not on the VPS; no Vercel/Cloudflare changes were made.
- SSH to the authorized VPS reaches port 22, but root key authentication is denied. A batch-only test accepted the offered ED25519 host key into local `~/.ssh/known_hosts`; its fingerprint is `SHA256:9wav+1ZCnxR5owau2pZxRzRdNO9LbJeTW9+VrXNV71k`. This has not been verified against the Contabo console. No server commands beyond SSH authentication, no host inspection, and no remote mutations were performed. Verify this fingerprint through Contabo before using the saved key.
- Reviewed current official Dokploy docs. Found and corrected a staging network assumption: Dokploy Isolated Deployments adds its generated proxy network to **every** Compose service, so it can place `db` on the Traefik-facing network. The staging instructions now require native Dokploy Domains with Isolated Deployments disabled; Preview Compose must confirm only `app` joins `dokploy-network`, `db` remains only on the internal `database` network, and neither service publishes ports. Official docs: https://docs.dokploy.com/docs/core/docker-compose/domains and https://docs.dokploy.com/docs/core/docker-compose/utilities.
- Synthetic Compose render passed with Docker Compose v5.5.1. It contains only `app` and `db`; neither publishes host ports; `database` is marked internal; app joins `edge` and `database`, while db joins only `database`. Runtime Dokploy transformations remain unverified until the VPS is accessible.
- Immediate infrastructure unblock: use the Contabo console to compare the host-key fingerprint and add `/home/izach/.ssh/id_ed25519.pub` to root (or another approved admin account); then retry SSH with `StrictHostKeyChecking=yes`. Do not send passwords or private keys in chat.

## Remote source reconciliation (2026-10-16)

- Read the supplied infrastructure continuation and Oliver developer implementation PDFs. Responsibility split: Isaac owns Python/Django/API, PostgreSQL/PostGIS, Docker/Dokploy, server security, VPN and backups; Oliver owns source handover, content/brand/frontend and frontend integration. Keep the current integrated Next.js app working while Django and API migration are designed incrementally. Do not permit Prisma and Django to independently change shared schema. These are assigned responsibilities, not evidence that the Django migration has started.
- No applicable AGENTS.md or CLAUDE.md was found at the repository root or inspected parent locations. Repository worktree was clean before reconciliation.
- Fetched `origin/main`; the remote had advanced from recorded `98da6d5` to `7483f0a` (`cx update`). Remote adds broad application changes, tests/CI, Node >=22.13 and pnpm 11.15.1, and new Prisma baseline/payment-settlement migrations. It moves historical SQL from `backend/prisma/migrations/manual/` to `backend/prisma/manual/`. Its `docs/DEPLOYMENT.md` explicitly prohibits applying the baseline to an existing populated database without isolated comparison and `migrate resolve`. No live database was accessed or changed.
- Preserved original local `main` at `b36d2f3`. Created local-only `infra/reconcile-20261015` from fetched `origin/main` and applied the four local infrastructure commits. Resolved overlap by retaining remote application/package versions and pinning the infrastructure Dockerfile to Node 22 / pnpm 11.15.1; retained both remote and infrastructure ignore rules. The standalone packaging hook retains the remote's robust missing-build check. No push or source-host mutation performed.
- The new remote baseline and settlement migration are source changes requiring review/rehearsal, not permission to migrate production. Original-developer completeness and execution ledger for historical manual SQL remain unconfirmed. Keep the original local branch and remote branch intact until source review and acceptance.
- New evidence required before publishing this branch: inspect reconciled diff and tests; run locked dependency install with lifecycle scripts disabled, Prisma generation/validation, lint, typecheck, unit tests and build; review migration SQL against the existing source database; agree a PR/release baseline. Do not use the production DB to make tests pass.
- Initial reconciled dependency install was attempted with `corepack pnpm@11.15.1 install --frozen-lockfile --ignore-scripts` but pnpm safely aborted because replacing the existing `node_modules` required a TTY confirmation. No dependency install or file change was completed by that attempt. Retry in a disposable linked worktree or a separately approved install environment so the existing checkout's dependencies are preserved.
- In the disposable worktree, pnpm 11.15.1 accepted the lockfile's supply-chain policy but rejected frozen install because workspace overrides did not match the lock. A lockfile-only reconciliation then failed: `pnpm-workspace.yaml` sets `next-auth: ^5.0.0`, for which the registry returned no matching version (latest stable 4.24.15; 5.x is beta, currently beta.32). The disposable checkout remained clean; no dependency or lockfile edits were retained. This needs source-owner review: either use a valid intentional beta range matching the approved NextAuth version or remove the override, regenerate the lockfile, then review auth changes and rerun checks. Do not silently change auth dependencies as infrastructure work.
- Because installation is blocked, no reconciled-branch Prisma/type/lint/unit/build checks are claimed. Existing validation results apply only to the prior source baseline (`98da6d5`), not the fetched application revision (`7483f0a`).

## Fresh public-site check during reconciliation

- Apex `mysaji.com` resolved to Vercel IPv4s `64.29.17.65` and `216.198.79.65`; HTTPS returned HTTP/2 200, and `/api/health` returned `status: ok`, `database: ok`.
- The Auth.js callback cookie still names `https://saji-3.vercel.app`. `www.mysaji.com` resolved to Cloudflare proxy IPv4s and returned HTTP 521 on this check. This supersedes the supplied PDF's earlier HTTP 403 observation for `www`; keep the exact response time and environment with each future check.
- No Vercel/Cloudflare changes or DNS mutations were performed. The Vercel origin and health result do not prove VPS deployment or migration.
