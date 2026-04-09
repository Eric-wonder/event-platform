# 多阶段构建：第一阶段构建 Vue 应用
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# 第二阶段：nginx 提供静态文件服务
FROM nginx:alpine
# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html
# 复制 nginx 配置（会在 docker-compose 中挂载覆盖）
# 暴露端口
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
