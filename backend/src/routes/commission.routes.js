const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

function calcCommission(orderAmount, rate) {
  if (!orderAmount || orderAmount <= 0) return 0;
  return Math.round(Number(orderAmount) * Number(rate) * 100) / 100;
}

// ─── 获取佣金列表（ADMIN 全部 / 渠道管理员仅自己）───────────
router.get('/', auth, catchAsync(async (req, res) => {
  const { page = 1, pageSize = 20, channelId, status, dateFrom, dateTo } = req.query;
  const isAdmin = req.user.role === 'ADMIN';

  const where = {};
  if (!isAdmin) {
    const ca = await prisma.channelAdmin.findUnique({ where: { userId: req.user.userId } });
    if (!ca) return res.status(403).json(fail(40300, '您不是渠道管理员'));
    where.channelId = ca.channelId;
  } else if (channelId) {
    where.channelId = Number(channelId);
  }
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59');
  }

  const [total, list] = await Promise.all([
    prisma.commissionRecord.count({ where }),
    prisma.commissionRecord.findMany({
      where,
      include: {
        channel: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, title: true, price: true } },
        registration: { select: { id: true, realName: true, phone: true, createdAt: true } },
      },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const formatted = list.map(r => ({
    ...r,
    orderAmount: Number(r.orderAmount),
    rate: Number(r.rate),
    amount: Number(r.amount),
    projectPrice: Number(r.project.price),
  }));

  const stats = await prisma.commissionRecord.groupBy({
    by: ['status'], where,
    _sum: { amount: true }, _count: true,
  });

  const summary = { totalCount: 0, totalAmount: 0, pendingCount: 0, pendingAmount: 0, settledCount: 0, settledAmount: 0 };
  for (const s of stats) {
    summary.totalCount += s._count;
    summary.totalAmount += Number(s._sum.amount || 0);
    if (s.status === 'PENDING') { summary.pendingCount = s._count; summary.pendingAmount = Number(s._sum.amount || 0); }
    else if (s.status === 'SETTLED') { summary.settledCount = s._count; summary.settledAmount = Number(s._sum.amount || 0); }
  }

  res.json(success({
    list: formatted, total,
    page: Number(page), pageSize: Number(pageSize),
    summary: {
      totalCount: summary.totalCount,
      totalAmount: Math.round(summary.totalAmount * 100) / 100,
      pendingCount: summary.pendingCount,
      pendingAmount: Math.round(summary.pendingAmount * 100) / 100,
      settledCount: summary.settledCount,
      settledAmount: Math.round(summary.settledAmount * 100) / 100,
    },
  }));
}));

// ─── 渠道统计（ADMIN）─────────────────────────────────────
router.get('/summary', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const channels = await prisma.channel.findMany({
    include: {
      _count: { select: { commissions: true } },
      commissions: { select: { status: true, amount: true } },
    },
  });
  const summary = channels.map(ch => {
    const pending = ch.commissions.filter(c => c.status === 'PENDING');
    const settled = ch.commissions.filter(c => c.status === 'SETTLED');
    return {
      channelId: ch.id, channelName: ch.name, channelCode: ch.code, rate: Number(ch.rate),
      totalCount: ch._count.commissions,
      pendingCount: pending.length, pendingAmount: Math.round(pending.reduce((s, c) => s + Number(c.amount), 0) * 100) / 100,
      settledCount: settled.length, settledAmount: Math.round(settled.reduce((s, c) => s + Number(c.amount), 0) * 100) / 100,
    };
  });
  res.json(success(summary));
}));

// ─── 批量结算佣金（ADMIN）─────────────────────────────────
router.post('/settle', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json(fail(40001, '请提供要结算的佣金记录 ID 列表'));
  }
  const result = await prisma.commissionRecord.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: { status: 'SETTLED', settledAt: new Date() },
  });
  res.json(success({ settled: result.count }, `已结算 ${result.count} 条佣金记录`));
}));

// ─── 佣金预览（已登录用户，防止滥用）────────────────────────
router.post('/preview', auth, catchAsync(async (req, res) => {
  const { price, channel } = req.body;
  if (!price || price < 0) return res.status(400).json(fail(40001, '请提供有效价格'));

  const channels = await prisma.channel.findMany({ where: { isEnabled: true } });
  const preview = channels.map(ch => ({
    channelId: ch.id, channelName: ch.name, channelCode: ch.code,
    rate: Number(ch.rate),
    amount: calcCommission(price, Number(ch.rate)),
  }));

  let targetedAmount = 0, targetedChannel = null;
  if (channel) {
    targetedChannel = channels.find(c => c.code === channel);
    if (targetedChannel) targetedAmount = calcCommission(price, Number(targetedChannel.rate));
  }

  res.json(success({ orderAmount: price, targetedChannel, targetedAmount, allChannels: preview }));
}));

module.exports = router;
