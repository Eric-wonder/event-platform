#!/usr/bin/env bash
# event-platform deployment script
set -euo pipefail

RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; BLUE="\033[0;34m"; NC="\033[0m"
log(){ echo -e "${BLUE}[INFO]${NC} $1"; }
ok(){ echo -e "${GREEN}[OK]${NC} $1"; }
warn(){ echo -e "${YELLOW}[WARN]${NC} $1"; }
err(){ echo -e "${RED}[ERR]${NC} $1"; exit 1; }

get_compose_cmd(){
    if docker compose version &>/dev/null; then echo "docker compose";
    else echo "docker-compose"; fi
}

check_env(){
    command -v docker &>/dev/null || err "Docker not installed. Run: curl -fsSL https://get.docker.com | sh"
    (command -v docker-compose &>/dev/null || docker compose version &>/dev/null) || err "Docker Compose not installed"
}

do_init(){
    check_env
    if [[ ! -f .env ]]; then cp .env.example .env; warn ".env created. Please edit .env then run ./deploy.sh init"; exit 1; fi
    local c; c=$(get_compose_cmd)
    log "Building and starting services..."
    $c up -d --build
    sleep 8
    $c exec -T node-app sh -c "npx prisma migrate deploy" 2>/dev/null && ok "DB migrated" || warn "DB migrate skipped"
    ok "All services started!"; show_status
}

do_start(){ local c; c=$(get_compose_cmd); check_env; $c up -d; ok "Started"; }
do_stop(){ local c; c=$(get_compose_cmd); check_env; $c down; ok "Stopped"; }
do_restart(){ local c; c=$(get_compose_cmd); check_env; $c restart; ok "Restarted"; }

do_update(){
    check_env
    local c; c=$(get_compose_cmd)
    [[ -d .git ]] && git pull 2>/dev/null || true
    $c up -d --build
    $c exec -T node-app sh -c "npx prisma migrate deploy" 2>/dev/null || true
    ok "Updated"
}

do_health(){
    check_env
    local c; c=$(get_compose_cmd)
    echo -e "\n${BLUE}=== Health Check ===${NC}"
    $c exec -T node-app sh -c "wget -qO- http://localhost:3000/api/health" 2>/dev/null && echo "Backend: OK" || echo "Backend: FAIL"
    $c exec -T nginx sh -c "wget -qO- http://localhost/health" 2>/dev/null && echo "Nginx: OK" || echo "Nginx: FAIL"
    mysql -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" -e "SELECT 1" &>/dev/null && echo "MySQL: OK" || echo "MySQL: FAIL"
}

do_logs(){
    local c; c=$(get_compose_cmd); check_env; $c logs -f --tail=100 "${1:-node-app}"
}

do_db_migrate(){
    local c; c=$(get_compose_cmd); check_env
    $c exec -T node-app sh -c "npx prisma migrate deploy" && ok "Migrated" || warn "Migration failed"
}

show_status(){ local c; c=$(get_compose_cmd); $c ps; echo -e "\nFrontend: http://<server-ip>\nAPI: http://<server-ip>:3000/api"; }

case "${1:-}" in
    init)      do_init ;;
    start)     do_start ;;
    stop)      do_stop ;;
    restart)   do_restart ;;
    update)    do_update ;;
    health)    do_health ;;
    logs)      do_logs "${2:-node-app}" ;;
    db:migrate) do_db_migrate ;;
    status)    show_status ;;
    *) echo "Usage: ./deploy.sh init|start|stop|restart|update|health|logs|db:migrate|status"
esac
