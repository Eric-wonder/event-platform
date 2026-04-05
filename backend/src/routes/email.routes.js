const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { catchAsync } = require('../utils/catchAsync');
const { success, fail } = require('../utils/response');
const {
  loadSettings, saveSettings,
  sendEmail, sendProjectSummary,
} = require('../services/email.service');

const router = express.Router();
const prisma = new PrismaClient();

router.use(auth, requireRole('ADMIN')); // 所有邮件接口均需 ADMIN

// ─── 获取邮件设置 ─────────────────────────────────────────
router.get('/settings', catchAsync(async (req, res) => {
  const settings = loadSettings();
  res.json(success({
    smtpHost: process.env.SMTP_HOST || 'smtp.qq.com',
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpUser: process.env.SMTP_USER || '',
    smtpHasPass: !!process.env.SMTP_PASS,
    toEmails: settings.toEmails || [],
    cronEnabled: settings.cronEnabled,
    cronTime: settings.cronTime || '09:00',
  }));
}));

// ─── 保存邮件设置 ─────────────────────────────────────────
router.put('/settings', catchAsync(async (req, res) => {
  const { toEmails, cronEnabled, cronTime } = req.body;
  if (!Array.isArray(toEmails)) return res.status(400).json(fail(40001, 'toEmails 必须是数组'));

  const validEmails = toEmails.filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (validEmails.length === 0) return res.status(400).json(fail(40001, '至少需要配置一个有效邮箱'));

  saveSettings({ toEmails: validEmails, cronEnabled: !!cronEnabled, cronTime: cronTime || '09:00' });

  // 热重载 cron
  if (global.emailCron) {
    global.emailCron.cancel();
    if (cronEnabled) {
      const { startEmailCron } = require('../services/cron.service');
      global.emailCron = startEmailCron(cronTime || '09:00');
    }
  }
  res.json(success(null, '设置已保存'));
}));

// ─── 发送测试邮件 ─────────────────────────────────────────
router.post('/test', catchAsync(async (req, res) => {
  const { to } = req.body;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json(fail(40001, '请提供有效邮箱地址'));
  }
  try {
    await sendEmail({
      to,
      subject: '🧪 活动平台邮件测试',
      html: `<p>这是一封测试邮件，发送时间：${new Date().toLocaleString('zh-CN')}</p>
             <p>如果您收到此邮件，说明邮件服务配置正常。</p>`,
    });
    await prisma.emailLog.create({
      data: { type: 'TEST', subject: '测试邮件', toEmails: JSON.stringify([to]),
        status: 'SENT', sentAt: new Date() },
    });
    res.json(success(null, '测试邮件发送成功'));
  } catch (err) {
    await prisma.emailLog.create({
      data: { type: 'TEST', subject: '测试邮件', toEmails: JSON.stringify([to]),
        status: 'FAILED', error: err.message },
    });
    res.status(500).json(fail(50001, `发送失败：${err.message}`));
  }
}));

// ─── 发送指定项目邮件 ─────────────────────────────────────
router.post('/send-project/:projectId', catchAsync(async (req, res) => {
  const projectId = Number(req.params.projectId);
  const { extraEmails } = req.body;
  try {
    await sendProjectSummary(projectId, extraEmails || []);
    const settings = loadSettings();
    await prisma.emailLog.create({
      data: { type: 'PROJECT_SUMMARY', subject: `项目报名汇总 #${projectId}`,
        toEmails: JSON.stringify([...(settings.toEmails || []), ...(extraEmails || [])]),
        status: 'SENT', sentAt: new Date(), remark: `项目ID: ${projectId}` },
    });
    res.json(success(null, '邮件发送成功'));
  } catch (err) {
    await prisma.emailLog.create({
      data: { type: 'PROJECT_SUMMARY', subject: `项目报名汇总 #${projectId}`,
        toEmails: '[]', status: 'FAILED', error: err.message, remark: `项目ID: ${projectId}` },
    });
    res.status(500).json(fail(50001, `发送失败：${err.message}`));
  }
}));

// ─── 获取邮件日志 ──────────────────────────────────────────
router.get('/logs', catchAsync(async (req, res) => {
  const { page = 1, pageSize = 20, type } = req.query;
  const where = type ? { type } : {};
  const [total, list] = await Promise.all([
    prisma.emailLog.count({ where }),
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
    }),
  ]);
  res.json(success({ list, total, page: Number(page), pageSize: Number(pageSize) }));
}));

module.exports = router;
