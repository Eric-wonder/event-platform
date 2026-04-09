FROM node:22-slim

WORKDIR /app

# 安装 Prisma 所需的系统依赖 + curl（健康检查用）
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci || npm install

# 复制源码
COPY . .

# 生成 Prisma Client（PrismaClient 会自动探测 openssl 版本）
RUN npx prisma generate

# 创建上传目录
RUN mkdir -p uploads

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "src/app.js"]
