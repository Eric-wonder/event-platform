const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { auth, optionalAuth } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

const VALID_ROLES = ['USER', 'ORGANIZER', 'ADMIN', 'CHANNEL_MANAGER'];

/** 签发 JWT */
function signToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

// ─── 注册 ───────────────────────────────────────────────
const registerSchema = z.object({
  username: z.string().min(2).max(50).regex(/^\w+$/, '用户名只能包含字母、数字、下划线'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少8位').max(128)
    .regex(/[A-Z]/, '密码必须包含大写字母')
    .regex(/[a-z]/, '密码必须包含小写字母')
    .regex(/[0-9]/, '密码必须包含数字'),
  role: z.enum(['USER', 'ORGANIZER']).optional(), // 公开注册只能是 USER 或 ORGANIZER
});

router.post('/register', catchAsync(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(40001, '参数校验失败', parsed.error.errors));

  const { username, email, password, role } = parsed.data;

  // 注册来源 IP 限流（生产环境建议用 Redis）
  const exist = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
  if (exist) {
    return res.status(409).json(fail(40900, exist.email === email ? '邮箱已被注册' : '用户名已被占用'));
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, role: role || 'USER' },
    select: { id: true, username: true, email: true, role: true, createdAt: true },
  });

  const token = signToken(user.id, user.role);
  res.status(201).json(success({ user, token }));
}));

// ─── 登录 ───────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, '密码不能为空'),
});

router.post('/login', catchAsync(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(40001, '参数校验失败', parsed.error.errors));

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json(fail(40100, '邮箱或密码错误'));
  if (user.isBanned) return res.status(403).json(fail(40300, '账号已被封禁'));

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json(fail(40100, '邮箱或密码错误'));

  const token = signToken(user.id, user.role);
  res.json(success({
    token,
    user: {
      id: user.id, username: user.username, email: user.email,
      role: user.role, avatar: user.avatar, phone: user.phone,
    },
  }));
}));

// ─── 登出 ───────────────────────────────────────────────
router.post('/logout', auth, (req, res) => {
  res.json(success(null, '已登出'));
});

// ─── 获取当前用户信息 ───────────────────────────────────
router.get('/me', auth, catchAsync(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true, username: true, email: true, role: true,
      avatar: true, phone: true, createdAt: true, isBanned: true,
    },
  });
  if (!user) return res.status(404).json(fail(40400, '用户不存在'));
  if (user.isBanned) return res.status(403).json(fail(40300, '账号已被封禁'));
  res.json(success(user));
}));

// ─── 修改个人信息 ───────────────────────────────────────
const updateMeSchema = z.object({
  username: z.string().min(2).max(50).regex(/^\w+$/).optional(),
  phone: z.string().max(20).optional(),
  oldPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128)
    .regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).optional(),
}).refine(d => !d.newPassword || d.oldPassword, { message: '修改密码必须提供旧密码' });

router.put('/me', auth, catchAsync(async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(40001, '参数校验失败', parsed.error.errors));

  const { username, phone, oldPassword, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json(fail(40400, '用户不存在'));
  if (user.isBanned) return res.status(403).json(fail(40300, '账号已被封禁'));

  if (newPassword) {
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) return res.status(400).json(fail(40001, '旧密码不正确'));
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  }

  if (username !== undefined) {
    const exist = await prisma.user.findFirst({ where: { username, NOT: { id: user.id } } });
    if (exist) return res.status(409).json(fail(40900, '用户名已被占用'));
    await prisma.user.update({ where: { id: user.id }, data: { username } });
  }
  if (phone !== undefined) await prisma.user.update({ where: { id: user.id }, data: { phone } });

  const updated = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, username: true, email: true, role: true, avatar: true, phone: true },
  });
  res.json(success(updated));
}));

// ─── 修改密码（通过旧密码，不需要登录态）────────────────────
// 独立端点，供忘记密码后重置使用（此处简化：需要登录）
router.post('/change-password', auth, catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json(fail(40001, '缺少参数'));

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (user.isBanned) return res.status(403).json(fail(40300, '账号已被封禁'));

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) return res.status(400).json(fail(40001, '旧密码不正确'));

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // 颁发新 token（携带最新角色）
  const token = signToken(user.id, user.role);
  res.json(success({ token }, '密码修改成功'));
}));

module.exports = router;
