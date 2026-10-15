# Selected platform: Dokploy self-hosted

Target only: vmi3668179, 169.58.242.133. User confirms Ubuntu 24.04, 6 vCPU, 12 GB RAM, 200 GB SSD and Contabo Auto Backup. Do not contact 178.238.225.126, 169.58.243.109 or 62.171.151.208. No cloud subscription or trial is authorized or needed for this choice.

## Access and installation gate

SSH handshake reached the retained VPS, but strict verification rejected the unknown host key before authentication. SSH username is confirmed as root. Existing key authentication has been rejected; public-key onboarding and console verification of the ED25519 host fingerprint remain required. Available public key: ~/.ssh/id_ed25519.pub; fingerprint SHA256:gETednbmAs5OhLsvCNtwsKB7kIOReeHZNbn98JB2YpA. Do not send the private key. Verify the server fingerprint independently before recording its public host key in known_hosts.

After access: run ops/inspect-host.sh read-only. Capture workloads, Docker/Swarm state, networks, volumes, listeners, firewall, capacity and mount paths. Inspect daemon configuration without printing credentials. Back up affected Docker, SSH, firewall and proxy configuration to a protected directory and encrypted off-server storage before any changes. Preserve provider console recovery. If 80/443/3000 are occupied or Swarm is already configured, explain the conflict and agree a coexistence path; do not stop services or force Swarm leave.

Official installation supports Ubuntu 24.04 and uses Docker/Swarm plus Traefik. Fetch the stable installer into a protected file, record checksum and resolved release, read it before execution, and use the release-specific installer when pinning. Review of the fetched installer found unconditional forced Swarm leave and forced dokploy-network removal, plus mode 777 on /etc/dokploy. Do not execute it unchanged against existing state; use reviewed non-destructive manual steps after inspection. Do not execute an unreviewed curl pipe or use canary. Host inspection and bootstrap firewall protection precede installation. The current docs list 80/443/3000 requirements; the local Caddy alternative would conflict. [Installation](https://docs.dokploy.com/docs/core/installation), [manual options](https://docs.dokploy.com/docs/core/manual-installation).

## Protected bootstrap and accounts

Before starting Dokploy, block public TCP 3000 in both provider and Docker-aware host forwarding rules, for IPv4 and IPv6. Permit only the intended administrator/VPN path; validate externally. Keep Swarm control/gossip/VXLAN ports private; a single-node install needs no public cluster ports. Do not expose Docker TCP or Traefik dashboard. Establish an SSH tunnel to 127.0.0.1:3000 through the verified SSH account. This permits registration without opening a public first-owner race.

The client custodian must create the organization/Owner account through that protected channel. Dokploy documents the Owner as nontransferable; do not create it under a temporary operator identity. Coordinate custodian, Isaac and Oliver account emails, each with their own password and MFA/passkey. Proposed roles: custodian Owner; Isaac Admin if responsible for platform operations, otherwise restricted Member; Oliver Member scoped to staging MySaji, without global Docker/Traefik/SSH-key/Git-provider access. Verify denied actions using each account before granting production access. No shared accounts; no paid custom-role assumption. [Permissions](https://docs.dokploy.com/docs/core/permissions).

## Dashboard TLS and DNS

Proposed record: deploy A 169.58.242.133, only after dashboard readiness and restricted access. Current lookup returned no A answer; inspect existing CNAME/AAAA and Cloudflare record export first. Obtain authenticated zone status and DNS access; preserve all email records. Use valid origin TLS and Cloudflare Full(strict), plus a VPN/IP restriction or an already authorized access gateway. Never trust arbitrary forwarded client-IP headers. Protect the origin as well as the Cloudflare hostname so IP/Host-header access cannot bypass restrictions.

Use DNS-01 or staged issuance if necessary; verify certificate hostname/chain with curl --resolve and no insecure override. Only after the HTTPS restricted path works should direct 3000 publication be removed, retaining a tested recovery path. Record prior deploy record/absence and SSL settings; rollback changes only that new dashboard record/configuration. Apex/www production cutover remains a separate release decision. [Hardening](https://docs.dokploy.com/docs/core/guides/production-hardening).

## Repository and staging

Use a GitHub App installation scoped to MySaji/MySaji only, with minimum required read/webhook permissions, or a repository-specific read-only deploy key for manual deployments. Never grant all repositories or organization administration by default. A GitHub owner performs any required consent; no ownership transfer. Keep auto-deploy off until checks and rollback are accepted. [GitHub setup](https://docs.dokploy.com/docs/core/github).

Create MySaji / staging, **Compose mode** (not Swarm Stack), source repo root, compose path ops/compose.dokploy.yaml. Dockerfile keeps integrated app intact. Enter the sanitized ops/dokploy.env.example fields in the Environment UI with staging-only values. Dokploy writes interpolation variables to .env; our explicit environment mapping avoids giving database-owner secrets to the app. Install reviewed init.sh and scheduler.mjs under SAJI_CONFIG_DIR, and independent owner/app secret files under SAJI_SECRETS_DIR with restricted ownership, before deployment. Do not mount live production data. [Compose configuration](https://docs.dokploy.com/docs/core/docker-compose).

Enable isolated deployments; route the chosen staging hostname to app:3000 through Domains. Inspect Preview Compose: only app should reach the proxy network; db must remain on its private internal network without published ports; app and db must retain their shared private network. Verify rendered mounts and project-specific volume names. Do not add database to a globally shared proxy network just to resolve routing. No Caddy service is present. Configure HTTPS redirect and restrict staging access. [Compose domains](https://docs.dokploy.com/docs/core/docker-compose/domains).

App/DB caps total ~5GiB; leave room for Dokploy PostgreSQL/Redis/Traefik, OS and builds on the confirmed 12GiB host. Limit concurrent builds to one and measure memory before increasing. Jobs remain disabled until sandbox delivery rehearsal. Full app migration rehearsal and source-baseline reconciliation remain as documented in DEVOPS_RUNBOOK.md.

## Backups and isolated recovery

Keep application backup/restore separate from the control plane. Existing ops/backup.sh is for standalone /opt/saji Compose and must be adapted to verified Dokploy service identifiers/paths before scheduling. Do not run it unchanged on the managed deployment.

Configure a dedicated off-server S3 destination with restricted credentials for Dokploy's control-plane backup: dokploy-postgres and /etc/dokploy. Its restore replaces control-plane state; demonstrate it only on an isolated disposable host with no production DNS or agent connectivity. Record version, snapshot ID, integrity, recovered project/account metadata and time. Do not restore it over the working instance. [Dokploy backups](https://docs.dokploy.com/docs/core/backups).

For application data retain encrypted logical PostGIS dumps, external-object inventory/exports, application encryption key, deployment env and release digests. Use client-side encryption (restic) or a reviewed encrypted export, plus protected bucket storage and independent recovery credentials. Provider Auto Backup is additional protection. Measure a clean restore, counts/aggregates, extensions/indexes, permissions, decryption and app smoke checks. Until off-server credentials and installation exist, a local synthetic restore is only procedure evidence, not proof of recoverable Dokploy/production state.

## Acceptance still required

Verified host inventory and non-disruptive installation; protected custodian registration; separate account/denial checks; origin HTTPS and restricted dashboard; limited GitHub grant; staging schema reconciliation and app health; external port checks for IPv4/IPv6; isolated application AND Dokploy restores; tested alert delivery; container restart persistence. Host reboot must be coordinated around existing workloads. WireGuard and separate Remote SSH development environments remain required; Dokploy is not a coding workspace.

Secret-file ownership: the DB init hook runs as the image postgres user, so app_db_password must be readable inside that container. For file-backed Compose secrets, use a root-owned mode-700 source directory with individually mounted mode-444 secret files (host users cannot traverse the parent), or verified container-UID ownership and mode 400. Do not mount the entire mode-700 directory to /run/secrets. The init hook now fails immediately on unreadable/empty app password. Validate these permissions on the host before first database initialization.

## Exact local dashboard access command

After verifying the service and blocking public bootstrap registration, run on the operator's computer:

```bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:13000:127.0.0.1:3000 root@169.58.242.133
```

Keep the terminal open and visit http://127.0.0.1:13000. This forwards only local loopback to the server's dashboard. It does not install Dokploy or verify that port 3000 is serving it. The proposed https://deploy.mysaji.com address is not yet configured or verified.
