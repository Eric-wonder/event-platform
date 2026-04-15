# ── 构建阶段：打包前端 ─────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# ── 运行阶段：nginx + 域名热重载 ──────────────────────────
FROM nginx:alpine

# 复制前端构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置（由 docker-compose volume 挂载，这里仅作 fallback）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制域名热重载入口脚本
COPY nginx-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/nginx-entrypoint.sh

# 暴露端口
EXPOSE 80 443

ENTRYPOINT ["/usr/local/bin/nginx-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
