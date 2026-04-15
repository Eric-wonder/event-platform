const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

// ─── 公开报名提交（无需登录）────────────────────────────
const publicRegisterSchema = z.object({
  realName: z.string().min(1, '请填写姓名').max(50),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请填写正确的手机号'),
  email: z.string().email('邮箱格式不正确').optional().or(z.literal('')),
  answers: z.record(z.any()).optional(),
});

router.post('/register/:projectId', catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const parsed = publicRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(fail(40001, '参数校验失败', parsed.error.errors));
  }

  // 检查项目
  const project = await prisma.registrationProject.findUnique({
    where: { id: Number(projectId) },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!project) return res.status(404).json(fail(40400, '项目不存在'));
  if (!project.isEnabled) return res.status(400).json(fail(40002, '项目未启用，无法报名'));
  if (project.deadline && new Date(project.deadline) < new Date()) {
    return res.status(400).json(fail(40003, '报名已截止'));
  }

  const { realName, phone, email, answers } = parsed.data;

  // 查重：同一项目同一手机号
  const exist = await prisma.publicRegistration.findUnique({
    where: { projectId_phone: { projectId: Number(projectId), phone } },
  });
  if (exist) return res.status(400).json(fail(40004, '该手机号已报名，无需重复提交'));

  // 自定义字段校验
  const errors = [];
  const parsedAnswers = answers || {};
  for (const field of project.fields) {
    const value = parsedAnswers[field.id];
    if (field.required) {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        errors.push(`「${field.label}」为必填项`);
      }
    }
    if (['SELECT', 'RADIO'].includes(field.fieldType) && value) {
      const opts = field.options ? JSON.parse(field.options) : [];
      if (!opts.includes(value)) errors.push(`「${field.label}」的选项值无效`);
    }
    if (field.fieldType === 'CHECKBOX' && Array.isArray(value)) {
      const opts = field.options ? JSON.parse(field.options) : [];
      for (const v of value) { if (!opts.includes(v)) { errors.push(`「${field.label}」含无效选项`); break; } }
    }
  }
  if (errors.length > 0) return res.status(400).json(fail(40001, errors.join('；')));

  // 创建报名
  const registration = await prisma.publicRegistration.create({
    data: {
      projectId: Number(projectId),
      realName: realName.trim(),
      phone,
      email: email || null,
      answers: parsedAnswers,
      status: 'PENDING',
    },
  });

  res.status(201).json(success({
    id: registration.id,
    status: registration.status,
    message: '报名成功',
  }));
}));

// ─── 查询报名状态（手机号验证）────────────────────────────
router.get('/register/:projectId/status', catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const { phone } = req.query;
  if (!phone) return res.status(400).json(fail(40001, '请提供手机号'));

  const reg = await prisma.publicRegistration.findUnique({
    where: { projectId_phone: { projectId: Number(projectId), phone } },
    select: { id: true, realName: true, status: true, createdAt: true },
  });
  if (!reg) return res.status(404).json(fail(40400, '未找到报名记录'));

  res.json(success(reg));
}));

// ─── 公开报名列表（ADMIN）────────────────────────────────
router.get('/:projectId/registrations', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const { page = 1, pageSize = 20, status } = req.query;

  const where = { projectId: Number(projectId) };
  if (status) where.status = status;

  const [total, list] = await Promise.all([
    prisma.publicRegistration.count({ where }),
    prisma.publicRegistration.findMany({
      where,
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json(success({ list, total, page: Number(page), pageSize: Number(pageSize) }));
}));

// ─── 审核公开报名（ADMIN）────────────────────────────────
router.patch('/:projectId/registrations/:regId/status', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const { regId } = req.params;
  const { status } = req.body;

  if (!['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    return res.status(400).json(fail(40001, '无效状态'));
  }

  const reg = await prisma.publicRegistration.findUnique({ where: { id: Number(regId) } });
  if (!reg) return res.status(404).json(fail(40400, '报名记录不存在'));

  const updated = await prisma.publicRegistration.update({
    where: { id: Number(regId) },
    data: { status },
    select: { id: true, realName: true, phone: true, email: true, status: true, updatedAt: true },
  });

  res.json(success(updated, '状态更新成功'));
}));

module.exports = router;
