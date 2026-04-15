#!/bin/sh
# nginx-reload — 监听 custom-domain 配置变化，自动重载 nginx
# 用法: 放入 custom-domain/nginx-reload.sh 并通过后台常驻运行

CONF_FILE="/custom-domain/domain.conf"
LAST_MD5=""

reload_if_changed() {
  if [ ! -f "$CONF_FILE" ]; then return; fi

  MD5=$(md5sum "$CONF_FILE" 2>/dev/null | cut -d' ' -f1)
  if [ "$MD5" != "$LAST_MD5" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Domain config changed, reloading nginx..."
    LAST_MD5="$MD5"
    nginx -s reload 2>/dev/null && echo "[$(date '+%Y-%m-%d %H:%M:%S')] nginx reloaded OK" \
      || echo "[$(date '+%Y-%m-%d %H:%M:%S')] nginx reload failed"
  fi
}

# 初始化
if [ -f "$CONF_FILE" ]; then
  LAST_MD5=$(md5sum "$CONF_FILE" 2>/dev/null | cut -d' ' -f1)
fi

echo "[nginx-reload] Started, watching $CONF_FILE"

# 每 5 秒轮询一次
while true; do
  sleep 5
  reload_if_changed
done
