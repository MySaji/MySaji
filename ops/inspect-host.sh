#!/usr/bin/env bash
# Read-only. Run only on retained vmi3668179 after host-key verification.
set -u
hostname
cat /etc/os-release
uptime
free -h
df -h
lsblk
ss -lntup
systemctl --failed --no-pager
systemctl list-timers --all --no-pager
if command -v docker >/dev/null; then
  docker version --format '{{.Server.Version}}'
  docker info --format 'Swarm={{.Swarm.LocalNodeState}} NodeID={{.Swarm.NodeID}}'
  docker ps --format '{{.Names}} {{.Image}} {{.Ports}} {{.Status}}'
  docker compose ls
  docker network ls
  docker volume ls
  docker service ls
fi
if command -v ufw >/dev/null; then ufw status verbose; fi
if command -v nft >/dev/null; then nft list ruleset; fi
