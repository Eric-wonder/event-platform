#!/bin/sh
# nginx-entrypoint.sh — 启动 nginx + 域名配置热重载守护进程

CONF_FILE="/custom-domain/domain.conf"
LAST_MD5=""

reload_if_changed() {
  if [ ! -f "$CONF_FILE" ]; then return; fi
  MD5=$(md5sum "$CONF_FILE" 2>/dev/null | cut -d' ' -f1)
  if [ "$MD5" != "$LAST_MD5" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Domain config changed, reloading nginx..."
    LAST_MD5="$MD5"
    nginx -s reload 2>/dev/null && echo "[nginx-reload] OK" || echo "[nginx-reload] Failed"
  fi
}

# 初始化
if [ -f "$CONF_FILE" ]; then
  LAST_MD5=$(md5sum "$CONF_FILE" 2>/dev/null | cut -d' ' -f1)
fi

# 启动 nginx（后台运行）
echo "[nginx-entrypoint] Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# 启动域名热重载轮询（前台运行，nginx 退出时一起退出）
echo "[nginx-entrypoint] Starting domain watcher (pid $NGINX_PID)..."
while kill -0 $NGINX_PID 2>/dev/null; do
  sleep 5
  reload_if_changed
done
echo "[nginx-entrypoint] Nginx stopped, exiting."
