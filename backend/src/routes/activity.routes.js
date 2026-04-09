const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { auth, optionalAuth, requireRole } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

/** 检查用户是否被封禁 */
async function checkNotBanned(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isBanned: true } });
  if (user?.isBanned) throw Object.assign(new Error('BANNED'), { status: 403 });
}

// ─── 公开列表 ────────────────────────────────────────────
router.get('/', optionalAuth, catchAsync(async (req, res) => {
  const { page = 1, pageSize = 10, status, category, keyword, startAfter } = req.query;
  const skip = (Number(page) - 1) * Number(pageSize);
  const where = { isDeleted: false };
  if (status) where.status = status;
  if (category) where.category = category;
  if (keyword) where.OR = [
    { title: { contains: keyword } },
    { description: { contains: keyword } },
  ];
  if (startAfter) where.startTime = { ...(where.startTime || {}), gte: new Date(startAfter) };

  const [total, list] = await Promise.all([
    prisma.activity.count({ where }),
    prisma.activity.findMany({
      where,
      include: {
        organizer: { select: { id: true, username: true, avatar: true } },
        _count: { select: { registrations: true } },
      },
      skip, take: Number(pageSize),
      orderBy: { startTime: 'asc' },
    }),
  ]);
  res.json(success({ list, total, page: Number(page), pageSize: Number(pageSize) }));
}));

// ─── 公开详情 ────────────────────────────────────────────
router.get('/:id', optionalAuth, catchAsync(async (req, res) => {
  const activity = await prisma.activity.findFirst({
    where: { id: Number(req.params.id), isDeleted: false },
    include: {
      organizer: { select: { id: true, username: true, avatar: true } },
      formFields: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { registrations: { where: { status: 'APPROVED' } } } },
    },
  });
  if (!activity) return res.status(404).json(fail(40400, '活动不存在'));
  res.json(success(activity));
}));

// ─── 创建活动 ────────────────────────────────────────────
const createActivitySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.string().min(1).max(50),
  maxCapacity: z.number().int().positive(),
  fee: z.number().min(0).optional(),
  location: z.string().min(1).max(300),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  regDeadline: z.string().datetime(),
  formFields: z.array(z.object({
    label: z.string(), fieldType: z.enum(['TEXT', 'TEXTAREA', 'SELECT', 'RADIO', 'CHECKBOX', 'DATE']),
    required: z.boolean().optional(), options: z.array(z.string()).optional(), sortOrder: z.number().optional(),
  })).optional(),
});

router.post('/', auth, requireRole('ORGANIZER', 'ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const parsed = createActivitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(40001, '参数校验失败', parsed.error.errors));

  const { formFields, ...activityData } = parsed.data;
  const activity = await prisma.activity.create({
    data: {
      ...activityData, organizerId: req.user.userId, fee: activityData.fee ?? 0,
      startTime: new Date(activityData.startTime), endTime: new Date(activityData.endTime),
      regDeadline: new Date(activityData.regDeadline),
      formFields: formFields ? {
        create: formFields.map((f, i) => ({
          ...f, sortOrder: f.sortOrder ?? i,
          options: f.options ? JSON.stringify(f.options) : null,
        })),
      } : undefined,
    },
    include: { formFields: true },
  });
  res.status(201).json(success(activity));
}));

// ─── 修改活动 ────────────────────────────────────────────
router.put('/:id', auth, requireRole('ORGANIZER', 'ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const activity = await prisma.activity.findUnique({ where: { id: Number(req.params.id) } });
  if (!activity) return res.status(404).json(fail(40400, '活动不存在'));
  if (activity.organizerId !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无权操作此活动'));
  }
  const { formFields, ...data } = req.body;
  const updated = await prisma.activity.update({
    where: { id: Number(req.params.id) },
    data: {
      ...data,
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined,
      regDeadline: data.regDeadline ? new Date(data.regDeadline) : undefined,
    },
    include: { formFields: { orderBy: { sortOrder: 'asc' } } },
  });
  res.json(success(updated));
}));

// ─── 删除（软删除）────────────────────────────────────────
router.delete('/:id', auth, requireRole('ORGANIZER', 'ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const activity = await prisma.activity.findUnique({ where: { id: Number(req.params.id) } });
  if (!activity) return res.status(404).json(fail(40400, '活动不存在'));
  if (activity.organizerId !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无权操作此活动'));
  }
  await prisma.activity.update({ where: { id: Number(req.params.id) }, data: { isDeleted: true } });
  res.json(success(null, '删除成功'));
}));

// ─── 修改状态 ────────────────────────────────────────────
router.patch('/:id/status', auth, requireRole('ORGANIZER', 'ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const { status } = req.body;
  const valid = ['DRAFT', 'PUBLISHED', 'ENDED', 'CANCELLED'];
  if (!valid.includes(status)) return res.status(400).json(fail(40001, '无效状态'));

  const activity = await prisma.activity.findUnique({ where: { id: Number(req.params.id) } });
  if (!activity) return res.status(404).json(fail(40400, '活动不存在'));
  if (activity.organizerId !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无权操作此活动'));
  }
  const updated = await prisma.activity.update({
    where: { id: Number(req.params.id) },
    data: { status },
    select: { id: true, status: true },
  });
  res.json(success(updated));
}));

// ─── 上传封面图 ──────────────────────────────────────────
const multer = require('multer');
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 jpg/png/gif/webp'), false);
  },
});

router.post('/:id/cover', auth, requireRole('ORGANIZER', 'ADMIN'), multerUpload.single('file'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  if (!req.file) return res.status(400).json(fail(40001, '未上传文件'));

  const activity = await prisma.activity.findUnique({ where: { id: Number(req.params.id) } });
  if (!activity) return res.status(404).json(fail(40400, '活动不存在'));
  if (activity.organizerId !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无权操作此活动'));
  }

  const fs = require('fs');
  const path = require('path');
  const ext = path.extname(req.file.originalname).toLowerCase();
  const filename = `cover_${activity.id}_${Date.now()}${ext}`;
  const dir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);

  const url = `/uploads/${filename}`;
  await prisma.activity.update({ where: { id: activity.id }, data: { coverImage: url } });
  res.json(success({ url }));
}));

// ─── 查看报名列表（仅组织者本人或 ADMIN）───────────────────
router.get('/:id/registrations', auth, requireRole('ORGANIZER', 'ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const activity = await prisma.activity.findUnique({ where: { id: Number(req.params.id) } });
  if (!activity) return res.status(404).json(fail(40400, '活动不存在'));
  if (activity.organizerId !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无权查看'));
  }
  const { page = 1, pageSize = 20, status } = req.query;
  const where = { activityId: activity.id };
  if (status) where.status = status;

  const [total, list] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, email: true } },
        fieldAnswers: { include: { field: { select: { label: true, fieldType: true } } } },
      },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.json(success({ list, total, page: Number(page), pageSize: Number(pageSize) }));
}));

// ─── 导出 CSV（仅组织者本人或 ADMIN）───────────────────────
router.get('/:id/export', auth, requireRole('ORGANIZER', 'ADMIN'), catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const activity = await prisma.activity.findUnique({ where: { id: Number(req.params.id) } });
  if (!activity) return res.status(404).json(fail(40400, '活动不存在'));
  if (activity.organizerId !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无权导出'));
  }
  const registrations = await prisma.registration.findMany({
    where: { activityId: activity.id },
    include: {
      user: { select: { username: true, email: true } },
      fieldAnswers: { include: { field: { select: { label: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const headers = ['姓名', '电话', '报名时间', '状态', '支付状态'];
  const extraLabels = activity.formFields?.map(f => f.label) || [];
  const rows = registrations.map(r => {
    const extra = {};
    (r.fieldAnswers || []).forEach(a => { extra[a.field.label] = a.value; });
    return [r.realName, r.phone, new Date(r.createdAt).toLocaleString('zh-CN'), r.status, r.payStatus,
      ...extraLabels.map(l => extra[l] || '')];
  });
  const escape = v => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [escape([...headers, ...extraLabels].join(',')), ...rows.map(r => escape(r.join(',')))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8-sig');
  res.setHeader('Content-Disposition', `attachment; filename="${activity.title}_报名表.csv"`);
  res.send('\ufeff' + csv);
}));

module.exports = router;
