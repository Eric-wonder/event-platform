const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

// 所有路由均需要认证 + ADMIN 角色
router.use(auth, requireRole('ADMIN'));

const VALID_ROLES = ['USER', 'ORGANIZER', 'ADMIN', 'CHANNEL_MANAGER'];

// ─── 获取用户列表 ─────────────────────────────────────────
router.get('/users', catchAsync(async (req, res) => {
  const { page = 1, pageSize = 20, role, keyword, isBanned } = req.query;
  const where = {};
  if (role && VALID_ROLES.includes(role)) where.role = role;
  if (keyword) {
    where.OR = [
      { username: { contains: keyword } },
      { email: { contains: keyword } },
    ];
  }
  if (isBanned !== undefined) where.isBanned = isBanned === 'true';

  const [total, list] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true, username: true, email: true, role: true,
        avatar: true, phone: true, isBanned: true, createdAt: true,
        _count: {
          select: {
            registrations: true,
            projectRegistrations: true,
            activities: true,
          },
        },
      },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.json(success({ list, total, page: Number(page), pageSize: Number(pageSize) }));
}));

// ─── 获取单个用户详情 ─────────────────────────────────────
router.get('/users/:id', catchAsync(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: Number(req.params.id) },
    select: {
      id: true, username: true, email: true, role: true,
      avatar: true, phone: true, isBanned: true, createdAt: true,
      _count: {
        select: {
          registrations: true, projectRegistrations: true,
          activities: true, notifications: true,
        },
      },
      channelAdmin: { select: { channelId: true, channel: { select: { name: true, code: true } } } },
    },
  });
  if (!user) return res.status(404).json(fail(40400, '用户不存在'));
  res.json(success(user));
}));

// ─── 修改用户角色（ADMIN 专属）──────────────────────────────
router.patch('/users/:id/role', catchAsync(async (req, res) => {
  const targetId = Number(req.params.id);
  const { role } = req.body;

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json(fail(40001, `无效角色。可选：${VALID_ROLES.join(' / ')}`));
  }
  // 禁止 ADMIN 将自己降级
  if (targetId === req.user.userId && role !== 'ADMIN') {
    return res.status(400).json(fail(40001, '无法修改自己的管理员角色'));
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return res.status(404).json(fail(40400, '用户不存在'));
  // 禁止修改另一个 ADMIN 的角色
  if (target.role === 'ADMIN' && role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无法修改其他管理员的角色'));
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { role },
    select: { id: true, username: true, role: true },
  });
  res.json(success(updated, `角色已更新为「${role}」`));
}));

// ─── 封禁用户 ─────────────────────────────────────────────
router.patch('/users/:id/ban', catchAsync(async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.userId) {
    return res.status(400).json(fail(40001, '无法封禁自己'));
  }
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return res.status(404).json(fail(40400, '用户不存在'));
  if (target.role === 'ADMIN') return res.status(403).json(fail(40300, '无法封禁管理员'));

  await prisma.user.update({ where: { id: targetId }, data: { isBanned: true } });
  res.json(success(null, '已封禁该用户'));
}));

// ─── 解封用户 ─────────────────────────────────────────────
router.patch('/users/:id/unban', catchAsync(async (req, res) => {
  const targetId = Number(req.params.id);
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return res.status(404).json(fail(40400, '用户不存在'));

  await prisma.user.update({ where: { id: targetId }, data: { isBanned: false } });
  res.json(success(null, '已解除封禁'));
}));

// ─── 重置用户密码（ADMIN 专属）─────────────────────────────
router.post('/users/:id/reset-password', catchAsync(async (req, res) => {
  const targetId = Number(req.params.id);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json(fail(40001, '密码至少8位'));
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return res.status(404).json(fail(40400, '用户不存在'));

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: targetId }, data: { passwordHash } });
  res.json(success(null, `密码已重置为「${newPassword}」，请告知用户及时修改`));
}));

// ─── 获取用户角色分布统计 ─────────────────────────────────
router.get('/stats', catchAsync(async (req, res) => {
  const stats = await prisma.user.groupBy({
    by: ['role', 'isBanned'],
    _count: true,
  });
  const summary = { total: 0, byRole: {}, bannedCount: 0 };
  for (const s of stats) {
    summary.total += s._count;
    summary.byRole[s.role] = (summary.byRole[s.role] || 0) + s._count;
    if (s.isBanned) summary.bannedCount += s._count;
  }
  res.json(success(summary));
}));

module.exports = router;
