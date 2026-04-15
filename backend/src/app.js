require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth.routes');
const activityRoutes = require('./routes/activity.routes');
const registrationRoutes = require('./routes/registration.routes');
const notificationRoutes = require('./routes/notification.routes');
const uploadRoutes = require('./routes/upload.routes');
const adminRoutes = require('./routes/admin.routes');
const projectRoutes = require('./routes/project.routes');
const fieldRoutes = require('./routes/field.routes');
const projRegisterRoutes = require('./routes/proj-register.routes');
const channelRoutes = require('./routes/channel.routes');
const commissionRoutes = require('./routes/commission.routes');
const exportRoutes = require('./routes/export.routes');
const emailRoutes = require('./routes/email.routes');
const payRoutes = require('./routes/pay.routes');          // ← 微信支付
const siteRoutes = require('./routes/site.routes');        // ← 网站设置
const publicRegisterRoutes = require('./routes/public-register.routes'); // ← 公开报名
const { errorHandler } = require('./utils/response');
const { startEmailCron } = require('./services/cron.service');
const { loadSettings } = require('./services/email.service');

const app = express();
const prisma = new PrismaClient();

// 信任 nginx 代理头
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000, max: 200,
  standardHeaders: true, legacyHeaders: false,
  message: { code: 42900, message: '请求过于频繁，请稍后再试' },
}));

app.use('/uploads', express.static(__dirname + '/../uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects/:id/fields', fieldRoutes);
app.use('/api/projects/:id/register', projRegisterRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/pay', payRoutes);                         // ← 微信支付
app.use('/api/site', siteRoutes);                       // ← 网站设置
app.use('/api/public', publicRegisterRoutes);           // ← 公开报名（无需登录）

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((req, res) => {
  res.status(404).json({ code: 40400, message: '接口不存在' });
});

app.use(errorHandler);

// ─── 启动定时任务 ──────────────────────────────────────────
const settings = loadSettings();
if (settings.cronEnabled) {
  startEmailCron(settings.cronTime || '09:00');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`后端服务已启动: http://localhost:${PORT}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
