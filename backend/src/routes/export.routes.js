const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { catchAsync } = require('../utils/catchAsync');
const { success, fail } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

async function checkNotBanned(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isBanned: true } });
  if (user?.isBanned) { const e = new Error('账号已被封禁'); e.status = 403; throw e; }
}

/**
 * GET /export/projects/:id/registrations
 * ADMIN → 导出全部；CHANNEL_MANAGER → 仅导出自己渠道的报名
 */
router.get('/projects/:id/registrations', auth, requireRole('ADMIN', 'CHANNEL_MANAGER'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const projectId = Number(req.params.id);

  const project = await prisma.registrationProject.findUnique({
    where: { id: projectId },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!project) return res.status(404).json(fail(40400, '项目不存在'));

  // 渠道管理员只能导出自己渠道的报名（按 channel 字段过滤）
  const where = { projectId };
  if (req.user.role === 'CHANNEL_MANAGER') {
    const ca = await prisma.channelAdmin.findUnique({ where: { userId: req.user.userId } });
    if (!ca) return res.status(403).json(fail(40300, '您不是渠道管理员'));
    const channel = await prisma.channel.findUnique({ where: { id: ca.channelId } });
    if (channel) where.channel = channel.code; // 精确匹配渠道代码
  }

  const registrations = await prisma.projectRegistration.findMany({
    where,
    include: {
      user: { select: { id: true, username: true, email: true, phone: true } },
      fields: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const XLSX = require('xlsx');
  const fields = project.fields || [];
  const headers = ['序号', '姓名', '手机号', '渠道来源', '报名时间', '支付状态', '审核状态', ...fields.map(f => f.label)];
  const rows = registrations.map((r, idx) => {
    const fileMap = {};
    (r.fields || []).forEach(f => { fileMap[f.fieldId] = f.value; });
    const answers = r.answers || {};
    const row = [
      idx + 1, r.realName, r.phone, r.channel || '-',
      new Date(r.createdAt).toLocaleString('zh-CN'),
      payStatusLabel(r.payStatus), regStatusLabel(r.status),
    ];
    for (const f of fields) {
      const v = f.fieldType === 'FILE' ? fileMap[f.id] : answers[f.id];
      if (v === undefined || v === null) row.push('-');
      else if (Array.isArray(v)) row.push(v.join('; '));
      else if (f.fieldType === 'FILE') row.push(v);
      else row.push(String(v));
    }
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map((h, i) => ({
    wch: Math.min(Math.max(h.length * 2, ...rows.map(r => String(r[i] || '').length * 1.5)), 60),
  }));
  XLSX.utils.book_append_sheet(wb, ws, '报名列表');

  const safeTitle = project.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
  const filename = `${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}));

function payStatusLabel(s) {
  return { FREE: '免费', UNPAID: '待支付', PAID: '已支付', REFUNDED: '已退款' }[s] || s;
}
function regStatusLabel(s) {
  return { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已拒绝', CANCELLED: '已取消' }[s] || s;
}

module.exports = router;
