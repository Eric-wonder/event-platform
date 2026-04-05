const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { catchAsync } = require('../utils/catchAsync');
const { success, fail } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

/** 获取用户的渠道 ID（渠道管理员） */
async function getChannelIdForUser(userId) {
  const ca = await prisma.channelAdmin.findUnique({ where: { userId } });
  return ca?.channelId || null;
}

// ─── 创建渠道（ADMIN）────────────────────────────────────
const createChannelSchema = z.object({
  name:        z.string().min(1).max(100),
  code:        z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'code 只能是字母数字下划线'),
  description: z.string().max(500).optional(),
  rate:        z.number().min(0).max(1).optional(),
});

router.post('/', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const parsed = createChannelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(40001, '参数校验失败', parsed.error.errors));

  const exist = await prisma.channel.findUnique({ where: { code: req.body.code } });
  if (exist) return res.status(400).json(fail(40001, '渠道代码已存在'));

  const channel = await prisma.channel.create({ data: { ...req.body, rate: req.body.rate ?? 0.10 } });
  res.status(201).json(success({ ...channel, rate: Number(channel.rate) }, '渠道创建成功'));
}));

// ─── 获取渠道列表
// ADMIN → 全部渠道；渠道管理员 → 仅自己的渠道
router.get('/', auth, catchAsync(async (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const isAdmin = req.user.role === 'ADMIN';

  if (isAdmin) {
    const [total, list] = await Promise.all([
      prisma.channel.count(),
      prisma.channel.findMany({
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { admins: true, commissions: true } } },
      }),
    ]);
    const formatted = list.map(c => ({
      ...c, rate: Number(c.rate),
      adminCount: c._count.admins, registrationCount: c._count.commissions,
    }));
    return res.json(success({ list: formatted, total, page: Number(page), pageSize: Number(pageSize) }));
  }

  // 渠道管理员：只返回自己的渠道
  const channelId = await getChannelIdForUser(req.user.userId);
  if (!channelId) return res.status(403).json(fail(40300, '您不是渠道管理员'));
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { _count: { select: { commissions: true } } },
  });
  res.json(success({ list: [{ ...channel, rate: Number(channel.rate), adminCount: 1, registrationCount: channel._count.commissions }], total: 1 }));
}));

// ─── 获取单个渠道详情
// ADMIN → 任意渠道；渠道管理员 → 仅自己的渠道
router.get('/:id', auth, catchAsync(async (req, res) => {
  const channelId = Number(req.params.id);
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { admins: { include: { user: { select: { id: true, username: true, email: true, phone: true } } } } },
  });
  if (!channel) return res.status(404).json(fail(40400, '渠道不存在'));

  if (req.user.role !== 'ADMIN') {
    const myChannelId = await getChannelIdForUser(req.user.userId);
    if (channelId !== myChannelId) return res.status(403).json(fail(40300, '无权查看此渠道'));
  }

  res.json(success({ ...channel, rate: Number(channel.rate) }));
}));

// ─── 更新渠道（ADMIN）────────────────────────────────────
const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  rate: z.number().min(0).max(1).optional(),
  isEnabled: z.boolean().optional(),
});

router.put('/:id', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const parsed = updateChannelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(40001, '参数校验失败', parsed.error.errors));

  const exist = await prisma.channel.findUnique({ where: { id: Number(req.params.id) } });
  if (!exist) return res.status(404).json(fail(40400, '渠道不存在'));

  const updated = await prisma.channel.update({ where: { id: Number(req.params.id) }, data: parsed.data });
  res.json(success({ ...updated, rate: Number(updated.rate) }));
}));

// ─── 删除渠道（ADMIN）────────────────────────────────────
router.delete('/:id', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const exist = await prisma.channel.findUnique({ where: { id: Number(req.params.id) } });
  if (!exist) return res.status(404).json(fail(40400, '渠道不存在'));
  await prisma.channel.delete({ where: { id: Number(req.params.id) } });
  res.json(success(null, '删除成功'));
}));

// ─── 添加渠道管理员（ADMIN）──────────────────────────────
const addAdminSchema = z.object({
  userId: z.number().int().positive().optional(),
  username: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});

router.post('/:id/admins', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const channelId = Number(req.params.id);
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return res.status(404).json(fail(40400, '渠道不存在'));

  const { userId, username, email, password } = req.body;
  let targetUserId = userId;

  if (!targetUserId) {
    if (!username || !email || !password) {
      return res.status(400).json(fail(40001, '新建渠道管理员需提供 username、email、password'));
    }
    const exists = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
    if (exists) return res.status(400).json(fail(40001, '用户名或邮箱已存在'));

    const hash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { username, email, passwordHash: hash, role: 'CHANNEL_MANAGER' },
    });
    targetUserId = newUser.id;
  }

  const existAdmin = await prisma.channelAdmin.findUnique({ where: { userId: targetUserId } });
  if (existAdmin) return res.status(400).json(fail(40001, '该用户已是渠道管理员'));

  await prisma.channelAdmin.create({ data: { userId: targetUserId, channelId } });
  await prisma.user.update({ where: { id: targetUserId }, data: { role: 'CHANNEL_MANAGER' } });

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, email: true, phone: true },
  });
  res.status(201).json(success({ channelId, user }, '添加成功'));
}));

// ─── 移除渠道管理员（ADMIN）──────────────────────────────
router.delete('/:id/admins/:userId', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  await prisma.channelAdmin.deleteMany({
    where: {
      channelId: Number(req.params.id),
      userId: Number(req.params.userId),
    },
  });
  res.json(success(null, '移除成功'));
}));

module.exports = router;
