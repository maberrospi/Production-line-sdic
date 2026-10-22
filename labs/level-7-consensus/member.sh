#!/usr/bin/env bash
# etcdctl inside ONE member, talking only to that member:   ./member.sh etcd3 get greeting
cd "$(dirname "$0")"
svc="${1:?usage: ./member.sh etcd1|etcd2|etcd3 <etcdctl arguments>}"; shift
if [ -t 0 ] && [ -t 1 ]; then TTY=""; else TTY="-T"; fi
exec docker compose exec $TTY "$svc" /usr/local/bin/etcdctl --endpoints=127.0.0.1:2379 "$@"
