# event-platform - 活动报名平台

## 系统架构
浏览器 -> Nginx:80 -> Vue3 前端
                -> /api/ -> Node.js:3000 -> MySQL:3306 / SMTP / 微信支付

## 环境要求
Docker >= 20.10 | Docker Compose >= 2.0

## 快速部署
1. 安装 Docker: sudo apt update && sudo apt install -y docker.io docker-compose
2. 上传代码: git clone ... && cd event-platform
3. 配置 .env: cp .env.example .env && nano .env
   必填: ROOT_PASSWORD / JWT_SECRET / ADMIN_PASSWORD / FRONTEND_URL
4. 部署: chmod +x deploy.sh && ./deploy.sh init
5. 验证: curl http://localhost:3000/api/health

## 运维命令
./deploy.sh start      启动
./deploy.sh stop       停止（保留数据）
./deploy.sh restart   重启
./deploy.sh update     更新代码
./deploy.sh health     健康检查
./deploy.sh logs       后端日志
./deploy.sh logs nginx Nginx日志
./deploy.sh db:migrate 数据库迁移
./deploy.sh status    容器状态

## 进入容器
docker compose exec node-app sh
docker compose exec mysql-db mysql -u root -p

## HTTPS配置
腾讯云申请免费证书，编辑nginx.conf启用HTTPS server块
docker compose exec nginx nginx -s reload

## 微信支付接入
申请商户号后配置 MCHID / APIV3_KEY / PRIVATE_KEY / SERIAL_NO
设置 WX_PAY_NOTIFY_URL 后 ./deploy.sh update

## 常见问题
端口被占用? 修改docker-compose.yml中ports映射
MySQL连接失败? 等待60秒健康检查完成
支付回调失败? 必须HTTPS，开放80/443端口
