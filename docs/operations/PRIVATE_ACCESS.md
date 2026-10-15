# MySaji private access handover

Status updated 2026-10-15. This is a plan and evidence record; no account, VPN peer or firewall change on the VPS has been performed. Latest retry reaches TCP port 22 but root public-key authentication is denied; earlier attempts saw Connection refused. Target: `vmi3668179` / `169.58.242.133` (user reports Ubuntu 24.04, 6 vCPU, 12 GB RAM, 200 GB SSD). Current working state is blocked on SSH onboarding.

## Intended access map

| Person | Device | WireGuard address | SSH user | SSH command over VPN | Dokploy account | VPN profile location |
|---|---|---:|---|---|---|---|
| Isaac | Pending confirmation | Pending | `isaac` (not created/verified) | `ssh isaac@10.77.0.1` (proposed; subnet must be checked against host/VPC/Docker routes) | Pending | Generate per device; secure delivery pending |
| Oliver | Pending | Pending | `oliver` (not created/verified) | `ssh oliver@10.77.0.1` (proposed; subnet must be checked against host/VPC/Docker routes) | Pending | Generate per device; secure delivery pending |

Do not use these proposed VPN addresses until host routes, Docker networks, Contabo network and client networks have been checked. Each device needs its own key pair and address. Current local public key fingerprint `SHA256:gETednbmAs5OhLsvCNtwsKB7kIOReeHZNbn98JB2YpA` is available; owner/device confirmation is pending. Oliver's public key/device details are pending. No private key has been requested or recorded.

## Access endpoints

Dokploy is not verified installed. If it is later installed and local port 3000 serves the dashboard, use this protected tunnel:

```bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:13000:127.0.0.1:3000 isaac@10.77.0.1
```

Then open `http://127.0.0.1:13000`. Replace `isaac` with the operator's named VPN SSH account. The dashboard must bind/restrict direct port 3000 before use; prefer a private VPN route. `deploy.mysaji.com` has not been configured or verified. The public website is intended to remain public; SSH, Dokploy, PostgreSQL and development tools must remain private.

VS Code Remote SSH example for each person's own `~/.ssh/config`:

```sshconfig
Host mysaji-vps
  HostName 10.77.0.1
  User isaac
  IdentityFile ~/.ssh/id_ed25519_mysaji_isaac
  IdentitiesOnly yes
  StrictHostKeyChecking yes
```

Oliver uses `User oliver` and his distinct private identity filename. Connect the WireGuard profile first, then use VS Code Remote SSH. Use separate workspaces and sanitized development data; don't edit the live release from a development session.

## Current blockers and evidence

- An earlier SSH root attempt to `169.58.242.133` failed with `Permission denied (publickey,password)`; the latest attempt reaches the SSH service but returns `Permission denied (publickey,password)`; an earlier retry returned `Connection refused`. No host inspection or changes ran. The first-seen host key is in `/tmp/saji-vmi3668179-known-hosts`, fingerprint `SHA256:9wav+1ZCnxR5owau2pZxRzRdNO9LbJeTW9+VrXNV71k`; verify it against the Contabo console before trusting it.
- First check VPS power/state, assigned IP and provider firewall/console because TCP port 22 currently returns Connection refused. Restore SSH through the provider console/rescue path without changing existing workloads; re-verify host fingerprint, then onboard the available public key. Only after SSH responds should host services, firewall, networks and routes be inventoried read-only.
- Dokploy installer review found forced Swarm leave and network removal, so do not run it unchanged on a host with unknown existing workloads.
- No named Linux account, WireGuard peer, Dokploy identity, VPN reachability, private port rule, external block test or reboot-persistence test is verified.

## Safe rollout order

1. Confirm provider console recovery and verify host fingerprint. Inspect host/Docker/Swarm/services/listeners/IPv4 and IPv6 rules/routes read-only. Back up relevant configuration before changes.
2. Confirm both SSH public keys and device labels. Create individual accounts and test named SSH access while retaining the active root session and console recovery. Sudo/Docker membership is high privilege; grant only what each person needs.
3. Select a non-overlapping VPN CIDR from actual host, VPC, Docker and client routes. Generate one client private key per device locally. Add public keys and unique /32 peers on the server. Use split tunnel routes only for required server/VPN addresses. Configure persistent startup and document revocation.
4. Test each VPN peer and named SSH login. Only then adjust firewall/root/password access. Maintain recovery and an established session throughout.
5. Secure Dokploy behind VPN/SSH tunnel, create separate named users with supported least privilege, secure owner recovery and MFA, then test both users and outside-network denial.
6. Verify public application reachability, private database/admin denial, IPv4 and IPv6, Docker/Swarm forwarding rules, peer revocation and persistence after an agreed restart.

## Recovery and revocation

If VPN fails, use verified provider console recovery. Do not remove the working root session until replacement access passes. To revoke a lost device, remove only its public-key peer stanza from WireGuard, reload WireGuard after validating config, then confirm that peer cannot handshake; rotate the device's SSH key and revoke its authorized key if that key was stored on the device. A person with several devices has separate peers/keys per device. Record revoked peer public-key fingerprint and timestamp, never private-key material.
