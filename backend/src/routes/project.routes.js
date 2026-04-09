const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { auth, optionalAuth, requireRole } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

async function checkNotBanned(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isBanned: true } });
  if (user?.isBanned) { const e = new Error('账号已被封禁'); e.status = 403; throw e; }
}

// ─── 公开列表 ─────────────────────────────────────────────
router.get('/', optionalAuth, catchAsync(async (req, res) => {
  const { page = 1, pageSize = 10, keyword, isEnabled } = req.query;
  const where = {};
  if (isEnabled === 'true') where.isEnabled = true;
  if (keyword) where.OR = [
    { title: { contains: keyword } },
    { content: { contains: keyword } },
  ];

  const [total, list] = await Promise.all([
    prisma.registrationProject.count({ where }),
    prisma.registrationProject.findMany({
      where,
      include: {
        _count: { select: { registrations: true } },
        fields: {
          where: { validation: { contains: 'channelTag' } },
          select: { id: true, label: true, validation: true, options: true },
        },
      },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json(success({ list, total, page: Number(page), pageSize: Number(pageSize) }));
}));

// ─── 公开详情（含渠道标记字段）────────────────────────────
router.get('/:id', optionalAuth, catchAsync(async (req, res) => {
  const project = await prisma.registrationProject.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      fields: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { registrations: true } },
    },
  });
  if (!project) return res.status(404).json(fail(40400, '项目不存在'));
  res.json(success(project));
}));

// ─── 创建项目（ADMIN）─────────────────────────────────────
const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  coverImage: z.string().url().optional().or(z.literal('')),
  price: z.number().min(0).optional(),
  isEnabled: z.boolean().optional(),
  deadline: z.string().datetime().optional().or(z.literal('')),
});

router.post('/', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(40001, '参数校验失败', parsed.error.errors));

  const { deadline, ...data } = parsed.data;
  const project = await prisma.registrationProject.create({
    data: { ...data, deadline: deadline ? new Date(deadline) : null },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  });
  res.status(201).json(success(project));
}));

// ─── 更新项目（ADMIN）─────────────────────────────────────
router.put('/:id', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const exist = await prisma.registrationProject.findUnique({ where: { id: Number(req.params.id) } });
  if (!exist) return res.status(404).json(fail(40400, '项目不存在'));

  const { deadline, ...data } = req.body;
  const updated = await prisma.registrationProject.update({
    where: { id: Number(req.params.id) },
    data: { ...data, deadline: deadline ? new Date(deadline) : undefined },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  });
  res.json(success(updated));
}));

// ─── 删除项目（ADMIN）──────────────────────────────────────
router.delete('/:id', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const exist = await prisma.registrationProject.findUnique({ where: { id: Number(req.params.id) } });
  if (!exist) return res.status(404).json(fail(40400, '项目不存在'));
  await prisma.registrationProject.delete({ where: { id: Number(req.params.id) } });
  res.json(success(null, '删除成功'));
}));

// ─── 查看报名列表（ADMIN）─────────────────────────────────
router.get('/:id/registrations', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const project = await prisma.registrationProject.findUnique({ where: { id: Number(req.params.id) } });
  if (!project) return res.status(404).json(fail(40400, '项目不存在'));

  const { page = 1, pageSize = 20, status } = req.query;
  const where = { projectId: project.id };
  if (status) where.status = status;

  const [total, list] = await Promise.all([
    prisma.projectRegistration.count({ where }),
    prisma.projectRegistration.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, email: true } },
        fields: { include: { field: { select: { label: true, fieldType: true } } } },
      },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.json(success({ list, total, page: Number(page), pageSize: Number(pageSize) }));
}));

// ─── 审核报名（ADMIN）─────────────────────────────────────
router.patch('/:id/registrations/:regId/status', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const { status } = req.body;
  if (!['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    return res.status(400).json(fail(40001, '无效状态'));
  }
  const reg = await prisma.projectRegistration.findUnique({ where: { id: Number(req.params.regId) } });
  if (!reg) return res.status(404).json(fail(40400, '报名记录不存在'));
  if (reg.projectId !== Number(req.params.id)) {
    return res.status(400).json(fail(40001, '报名与项目不匹配'));
  }
  const updated = await prisma.projectRegistration.update({
    where: { id: Number(req.params.regId) },
    data: { status },
    select: { id: true, status: true },
  });
  // 发通知
  await prisma.notification.create({
    data: {
      userId: reg.userId,
      title: `报名${status === 'APPROVED' ? '已通过' : status === 'REJECTED' ? '被拒绝' : '状态变更'}`,
      content: `您报名「${reg.projectId}」的状态已更新为「${status}」。`,
      type: `reg_${status.toLowerCase()}`,
      refId: reg.id,
    },
  });
  res.json(success(updated));
}));

module.exports = router;
