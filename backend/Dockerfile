FROM node:22-alpine

WORKDIR /app

# 先复制依赖文件
COPY package*.json ./

# 安装依赖（跳过 optional 会减少镜像体积）
RUN npm ci --omit=optional || npm install --omit=optional

# 复制源码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 创建上传目录
RUN mkdir -p uploads

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "src/app.js"]
