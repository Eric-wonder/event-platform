const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

async function checkNotBanned(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isBanned: true } });
  if (user?.isBanned) {
    const err = new Error('账号已被封禁'); err.status = 403; throw err;
  }
}

// ─── 报名活动 ─────────────────────────────────────────────
const registerSchema = z.object({
  realName: z.string().min(1).max(50),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  idCard: z.string().regex(/^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/).optional().or(z.literal('')),
  remark: z.string().max(500).optional(),
  fieldAnswers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});

router.post('/activities/:id/register', auth, catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const activityId = Number(req.params.id);
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(40001, '参数校验失败', parsed.error.errors));

  const { realName, phone, idCard, remark, fieldAnswers } = parsed.data;

  const activity = await prisma.activity.findFirst({
    where: { id: activityId, isDeleted: false },
    include: { formFields: true },
  });
  if (!activity) return res.status(404).json(fail(40400, '活动不存在'));
  if (activity.status !== 'PUBLISHED') return res.status(400).json(fail(40001, '该活动当前不在报名中'));
  if (new Date() > new Date(activity.regDeadline)) return res.status(400).json(fail(40001, '报名已截止'));
  if (activity.currentCount >= activity.maxCapacity) return res.status(400).json(fail(40001, '名额已满'));

  const exist = await prisma.registration.findUnique({
    where: { activityId_userId: { activityId, userId: req.user.userId } },
  });
  if (exist) return res.status(409).json(fail(40900, '您已报名此活动'));

  for (const field of (activity.formFields || [])) {
    if (field.required) {
      const val = fieldAnswers?.[String(field.id)];
      if (!val || (Array.isArray(val) && val.length === 0)) {
        return res.status(400).json(fail(40001, `请填写必填字段：${field.label}`));
      }
    }
  }

  const registration = await prisma.$transaction(async (tx) => {
    const reg = await tx.registration.create({
      data: {
        activityId, userId: req.user.userId, realName, phone,
        idCard: idCard || null, remark: remark || null,
        payStatus: Number(activity.fee) === 0 ? 'FREE' : 'UNPAID',
        fieldAnswers: fieldAnswers ? {
          create: Object.entries(fieldAnswers).map(([fieldId, value]) => ({
            fieldId: Number(fieldId),
            value: Array.isArray(value) ? value.join(',') : String(value),
          })),
        } : undefined,
      },
    });
    await tx.activity.update({ where: { id: activityId }, data: { currentCount: { increment: 1 } } });
    return reg;
  });

  await prisma.notification.create({
    data: {
      userId: activity.organizerId,
      title: '新报名通知',
      content: `用户 ${req.user.username || req.user.userId} 报名了活动「${activity.title}」，请及时审核。`,
      type: 'reg_new', refId: registration.id,
    },
  });

  res.status(201).json(success(registration, '报名成功'));
}));

// ─── 取消报名 ─────────────────────────────────────────────
router.delete('/activities/:id/register', auth, catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const reg = await prisma.registration.findUnique({
    where: { activityId_userId: { activityId: Number(req.params.id), userId: req.user.userId } },
  });
  if (!reg) return res.status(404).json(fail(40400, '报名记录不存在'));
  if (['REJECTED', 'CANCELLED'].includes(reg.status)) {
    return res.status(400).json(fail(40001, '该报名已无法取消'));
  }

  await prisma.$transaction(async (tx) => {
    await tx.registration.update({ where: { id: reg.id }, data: { status: 'CANCELLED' } });
    await tx.activity.update({ where: { id: reg.activityId }, data: { currentCount: { decrement: 1 } } });
  });
  res.json(success(null, '取消报名成功'));
}));

// ─── 我的报名记录 ─────────────────────────────────────────
router.get('/mine', auth, catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const { page = 1, pageSize = 10, status } = req.query;
  const where = { userId: req.user.userId };
  if (status) where.status = status;

  const [total, list] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.findMany({
      where,
      include: {
        activity: {
          select: {
            id: true, title: true, coverImage: true, location: true,
            startTime: true, endTime: true, status: true,
            organizer: { select: { username: true } },
          },
        },
        fieldAnswers: { include: { field: { select: { label: true } } } },
      },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.json(success({ list, total, page: Number(page), pageSize: Number(pageSize) }));
}));

// ─── 报名详情（本人、活动组织者、ADMIN 可查看）────────────
router.get('/:id', auth, catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const reg = await prisma.registration.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      activity: { include: { organizer: { select: { id: true, username: true } } } },
      fieldAnswers: { include: { field: true } },
    },
  });
  if (!reg) return res.status(404).json(fail(40400, '报名记录不存在'));

  const canView = reg.userId === req.user.userId
    || reg.activity.organizerId === req.user.userId
    || req.user.role === 'ADMIN';
  if (!canView) return res.status(403).json(fail(40300, '无权查看'));

  res.json(success(reg));
}));

// ─── 审核报名（仅组织者本人或 ADMIN）───────────────────────
router.patch('/:id/status', auth, requireRole('ORGANIZER', 'ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const reg = await prisma.registration.findUnique({
    where: { id: Number(req.params.id) },
    include: { activity: true },
  });
  if (!reg) return res.status(404).json(fail(40400, '报名记录不存在'));
  if (reg.activity.organizerId !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无权审核此报名'));
  }
  const { status } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json(fail(40001, '状态只能是 APPROVED 或 REJECTED'));
  }
  if (reg.status !== 'PENDING') return res.status(400).json(fail(40001, '该报名已被审核过'));

  const updated = await prisma.registration.update({
    where: { id: reg.id },
    data: { status },
    select: { id: true, status: true },
  });
  await prisma.notification.create({
    data: {
      userId: reg.userId,
      title: `报名${status === 'APPROVED' ? '已通过' : '被拒绝'}`,
      content: `您报名「${reg.activity.title}」的申请已${status === 'APPROVED' ? '通过' : '拒绝'}。`,
      type: status === 'APPROVED' ? 'reg_approved' : 'reg_rejected', refId: reg.id,
    },
  });
  res.json(success(updated));
}));

module.exports = router;
