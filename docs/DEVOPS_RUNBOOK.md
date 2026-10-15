# MySaji deployment and handover runbook

**Dokploy self-hosted is now selected. Follow DOKPLOY_SETUP.md and ops/compose.dokploy.yaml for the retained VPS. Caddy and direct /opt/saji Compose release commands below are the standalone alternative, not commands to execute alongside Dokploy.**

Templates are prepared, not a completed deployment. Use /opt/saji as the release directory only after inspecting the host. Never use production credentials/data for local validation.

## Inspect the supplied host before changes

Target supplied by user: vmi3668179 / 169.58.242.133. Await OS, plan, SSH user and key path/alias. Verify host-key fingerprint through the provider console. Connect with BatchMode and StrictHostKeyChecking=yes once the verified host key is installed; never request a private key/password in chat.

Read-only inspection: hostnamectl, /etc/os-release, uname -a, uptime, free -h, df -h, lsblk, ss -lntup, systemctl --failed, docker ps, docker compose ls, docker network ls, docker volume ls, ufw status verbose, nft list ruleset or iptables-save, systemctl list-timers. Avoid dumping process environments, secrets or customer logs. Inventory existing reverse proxies, databases, domains, port collisions and backups. Preserve existing workloads and firewall policies. Record actual capacity and available disk before choosing resource caps or installing packages.

## WireGuard and separate developer access

Proposed VPN subnet 10.77.0.0/24 must first be checked for overlap. Server 10.77.0.1, distinct /32 per developer. Generate each private key on the device that owns it; exchange public keys only. Server configuration template: ops/wireguard/wg0.conf.example. Client AllowedIPs should be only the required VPN addresses; do not route all internet traffic. Public UDP 51820 is the VPN ingress, not public SSH.

Create individual Linux accounts and individual SSH authorized keys; disable password login and root login after testing alternate access. Only designated infrastructure maintainers get sudo; Docker group membership effectively grants root and must not be given casually. Keep provider console recovery access. Establish VPN and verify a second SSH session before restricting public SSH. Permit SSH only on wg0 from authorized peer /32s; prohibit public port 22 for both IPv4/IPv6. Do not blindly replace existing firewall rules.

Publish only 80/443 (and UDP 51820 at host); no DB, app, dev server or IDE internet ports. Docker forwarding can bypass UFW. Inspect Docker firewall backend and enforce forwarding rules in DOCKER-USER for iptables, or the appropriate nftables forwarding chain for that backend; preserve established connections and existing workloads. Do not disable Docker firewall management. Verify from an external network that 22/5432/3000 are unreachable and from VPN that permitted services work. Also inspect IPv6 and direct routing settings.

VS Code Remote SSH example in the developer's ~/.ssh/config:

```sshconfig
Host saji-dev
  HostName 10.77.0.1
  User developer_alice
  IdentityFile ~/.ssh/id_ed25519_saji_alice
  IdentitiesOnly yes
  StrictHostKeyChecking yes
```

Use Remote-SSH: Connect to Host, then open the developer's own checkout. Prefer a separate development VM; if the VPS is shared, use separate Unix identities, directories, Compose project/network/volume names and DB credentials, with no access to production secrets. Use synthetic/sanitized data, sandbox payments, a mail sink and no production cron/webhooks. Bind development HTTP only to loopback and forward through SSH/VS Code. Never expose production DB for convenience; maintenance access is limited to designated operators through VPN/SSH.

## Migration rehearsal and reconciliation

1. Obtain original developer source/diff/untracked SQL confirmation. Inventory actual source PG version, PostGIS version/schema, all application schemas, migration history if any, roles/owners/RLS/functions/triggers/publications and storage dependencies. Hash SQL files and record which statements ran and when. No bulk replay of manual SQL.
2. Agree export authorization and a sanitized dataset; live customer dumps stay encrypted outside Git. Export using a matching pg_dump major, with a source snapshot and recorded timestamp. Preserve custom SQL and cryptographic keys. Inventory table counts, IDs, financial totals by currency/status, wallet/escrow balances, order states, orphan references, URL objects and storage checksums. Store sensitive evidence privately, not in docs.
3. Create an isolated rehearsal Compose project with different secrets and volume names, no public ports, no scheduler and no provider credentials. Choose source-compatible PG/PostGIS. Restore only reviewed application schemas using pg_restore --no-owner --no-privileges --exit-on-error into the empty rehearsal database. Precreate required extensions in their correct schemas; review Supabase-specific dependencies rather than deleting errors or using --clean on production.
4. Compare Prisma schema with restored DB using Prisma 6.19.3 migrate diff and read the generated SQL. Reconcile manual SQL and live objects, including five spatial GiST indexes from backend/scripts/enable-postgis.js. That script requires dotenv, which is not a declared direct dependency; do not assume it runs unchanged under pnpm. Generate a reviewed SQL equivalent or explicitly resolve the script dependency before use. No db push --accept-data-loss.
5. Establish a reviewed baseline for the ACTUAL reconciled database before adopting Prisma Migrate. Include non-Prisma objects separately. Mark baseline applied only after database/schema equivalence is demonstrated; current manual files are not a baseline.
6. Apply grants: application needs USAGE on public/extensions, SELECT/INSERT/UPDATE/DELETE on existing application tables, USAGE/SELECT on existing sequences, and matching default privileges for the actual migration owner. Test app cannot create roles or databases. Do not grant source Supabase roles blindly.
7. Test login/session, role/tenant access, uploads, email asset, geofence distance/index plans, health, sandbox payment callbacks and encryption/decryption using synthetic records. Compare every table count and key financial aggregate, constraints and object checksums. Record expected deviations with named reviewer and acceptance.
8. Time complete restore and recovery; rehearse forward migration and old-image compatibility. Agree write freeze/final delta strategy. Only after explicit live-cutover authorization: freeze source writers/jobs, export final snapshot, reconcile, switch app, verify, then enable new writers/jobs. Keep old source read-only during acceptance. Never dual-write or switch back to a stale database after new transactions.

## Build and release

Create protected ops/secrets/db_password and app_db_password with independent random passwords, mode 600. Copy sanitized app.env.example and deploy.env.example to ignored actual files and replace placeholders. URL-encode app DB password. Retain the existing PAYMENT_METHOD_ENCRYPTION_KEY for migrated data. Set direct and pooled URLs appropriately; on this private server both app runtime URLs use restricted saji_app. Use separate owner credentials only for reviewed migration tools.

Build off-host using the pinned package manager and reviewed public build args:

```bash
docker build -t saji:COMMIT .
docker compose --env-file ops/deploy.env -f ops/compose.yaml config --quiet
```

Do not release merely because next build succeeds: this repository skips TypeScript errors. Require build, separate typecheck, lint remediation, reviewed dependency/security posture and staging smoke tests. Record immutable app/DB/proxy image digests, source commit, environment version and database compatibility.

Stage DB alone with `docker compose --env-file ops/deploy.env -f ops/compose.yaml up -d db`. Apply only reviewed schema/restore procedure; there is deliberately no automatic schema change. Stage app with `up -d app`. It must become healthy against the database. Inspect health from inside the container or controlled SSH forwarding; no public app port is needed. Stage certificates and proxy as described in DEVOPS_EXECUTION.md, verify origin TLS, then obtain explicit live-cutover authorization before changing DNS/data writers.

For an authorized release: take and verify a pre-release off-server backup, record previous image digest, apply only backwards-compatible reviewed migrations, update APP_IMAGE, then `up -d --no-deps app`. Verify health, assets, auth and sandbox flows before acceptance. Enable `--profile jobs up -d scheduler` only after old scheduler is disabled and delivery approved. This single-instance approach can incur brief downtime; use staged proxy switching if the agreed SLA requires it.

Rollback: set APP_IMAGE to the recorded prior digest and recreate app only if schema/data remain compatible. Do not automatically reverse migrations. For incompatible changes, stop writers/jobs and execute a reviewed forward repair or approved restore with a documented data-loss window. Never `down -v`, reset a production DB, or restore over live data without authorization. Restore to a new isolated volume first. Keep previous encrypted backup and release assets until acceptance.

## Off-server backups and recovery

Install restic and set /etc/saji/backup.env (root-only): RESTIC_REPOSITORY must point to an independent off-server destination, RESTIC_PASSWORD_FILE to a protected key file, plus destination credentials as required. Initialize the repository once with restic init only after verifying destination ownership. Keep recovery credentials/key in a separate approved password vault. Restrict destination permissions and enable immutable retention where available.

ops/backup.sh takes a custom-format logical DB dump, checks the archive list, and encrypts it with app configuration/secrets through restic. It fails on errors, prevents concurrent runs, cleans its temporary plaintext directory and runs restic check. It does not claim archive-list validation proves recoverability. Database volume is not copied live. Account for export disk headroom. If storage inventory finds external objects, add a separately verified consistent object export and checksum manifest to backup; current script cannot back up remote Supabase objects.

Install the supplied systemd service/timer only after a successful manual backup. Daily 01:00 UTC with persistent catch-up; configure monitoring for service failures, repository age >26 hours, disk >80%, container health, TLS expiry, and job failures. Alert delivery must be tested. Proposed retention: 7 daily / 5 weekly / 12 monthly, confirmed with client; do not enable pruning until a successful restore and retention approval.

Monthly and before cutover: restore a chosen restic snapshot into a protected temporary directory on an isolated host; verify archive list, restore dump to a NEW empty compatible PG/PostGIS database with --exit-on-error, reconcile schema/table counts/financial totals and decrypt a synthetic encrypted field. Run app smoke tests with sandbox integrations and jobs disabled. Record snapshot ID, image digests, elapsed time, reconciliation results and reviewer. Clean temporary plaintext only after evidence is retained securely. Test recovery when production host is unavailable, including independent access to backup keys.

## Handover acceptance

Required evidence: source-baseline sign-off, host inventory, separate access identities/VPN recovery, external port scan, HTTPS/Full(strict), email preservation, image digests/build checks, migration reconciliation, scheduler execution, successful off-server backup AND measured restore, tested alerts, release/rollback rehearsal and named operators. Record unmet feature tests separately; infrastructure setup cannot certify all marketplace/payment behavior.

Secret-file ownership: the DB init hook runs as the image postgres user, so app_db_password must be readable inside that container. For file-backed Compose secrets, use a root-owned mode-700 source directory with individually mounted mode-444 secret files (host users cannot traverse the parent), or verified container-UID ownership and mode 400. Do not mount the entire mode-700 directory to /run/secrets. The init hook now fails immediately on unreadable/empty app password. Validate these permissions on the host before first database initialization.
