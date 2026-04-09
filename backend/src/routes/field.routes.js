const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

// ⚠️ 所有路由均以 /projects/:id/fields 为前缀（由 app.js 中的 mount path 决定）
// 本文件内无需再处理 projectId，直接从 req.params.id 获取

// ─── 获取字段列表（ADMIN）────────────────────────────────
router.get('/', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await prisma.registrationProject.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json(fail(40400, '项目不存在'));

  const fields = await prisma.projectField.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
  });
  res.json(success(fields.map(f => ({
    ...f,
    options: f.options ? JSON.parse(f.options) : [],
    validation: f.validation ? JSON.parse(f.validation) : {},
  }))));
}));

// ─── 新增字段（ADMIN）────────────────────────────────────
router.post('/', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await prisma.registrationProject.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json(fail(40400, '项目不存在'));

  const { label, fieldType, required, placeholder, options, sortOrder, validation } = req.body;
  if (!label || !fieldType) return res.status(400).json(fail(40001, 'label 和 fieldType 必填'));

  const field = await prisma.projectField.create({
    data: {
      projectId,
      label,
      fieldType,
      required: !!required,
      placeholder: placeholder || null,
      options: options ? JSON.stringify(options) : null,
      sortOrder: sortOrder ?? 0,
      validation: validation ? JSON.stringify(validation) : null,
    },
  });
  res.status(201).json(success(field));
}));

// ─── 更新字段（ADMIN）────────────────────────────────────
router.put('/:fieldId', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const projectId = Number(req.params.id);
  const fieldId = Number(req.params.fieldId);

  const exist = await prisma.projectField.findFirst({ where: { id: fieldId, projectId } });
  if (!exist) return res.status(404).json(fail(40400, '字段不存在'));

  const { label, fieldType, required, placeholder, options, sortOrder, validation } = req.body;
  const updated = await prisma.projectField.update({
    where: { id: fieldId },
    data: {
      label: label ?? exist.label,
      fieldType: fieldType ?? exist.fieldType,
      required: required !== undefined ? required : exist.required,
      placeholder: placeholder !== undefined ? (placeholder || null) : exist.placeholder,
      options: options !== undefined ? (options ? JSON.stringify(options) : null) : exist.options,
      sortOrder: sortOrder ?? exist.sortOrder,
      validation: validation !== undefined ? (validation ? JSON.stringify(validation) : null) : exist.validation,
    },
  });
  res.json(success(updated));
}));

// ─── 删除字段（ADMIN）────────────────────────────────────
router.delete('/:fieldId', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const projectId = Number(req.params.id);
  const fieldId = Number(req.params.fieldId);

  const exist = await prisma.projectField.findFirst({ where: { id: fieldId, projectId } });
  if (!exist) return res.status(404).json(fail(40400, '字段不存在'));

  await prisma.projectField.delete({ where: { id: fieldId } });
  res.json(success(null, '删除成功'));
}));

// ─── 批量保存字段（ADMIN）────────────────────────────────
router.post('/batch', auth, requireRole('ADMIN'), catchAsync(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await prisma.registrationProject.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json(fail(40400, '项目不存在'));

  const { fields } = req.body;
  if (!Array.isArray(fields)) return res.status(400).json(fail(40001, 'fields 必须是数组'));

  // 事务：先删后插
  const saved = await prisma.$transaction(async (tx) => {
    await tx.projectField.deleteMany({ where: { projectId } });
    const created = await tx.projectField.createMany({
      data: fields.map((f, i) => ({
        projectId,
        label: f.label,
        fieldType: f.fieldType,
        required: !!f.required,
        placeholder: f.placeholder || null,
        options: f.options ? JSON.stringify(f.options) : null,
        sortOrder: f.sortOrder ?? i,
        validation: f.validation ? JSON.stringify(f.validation) : null,
      })),
    });
    return tx.projectField.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } });
  });

  res.json(success(saved, '保存成功'));
}));

module.exports = router;
