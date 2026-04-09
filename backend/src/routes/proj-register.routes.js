const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

async function checkNotBanned(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isBanned: true } });
  if (user?.isBanned) { const e = new Error('账号已被封禁'); e.status = 403; throw e; }
}

// ─── 用户提交报名（自动计算佣金）────────────────────────────
router.post('/', auth, catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const projectId = Number(req.params.id);
  const { realName, phone, channel, answers } = req.body;

  const project = await prisma.registrationProject.findUnique({
    where: { id: projectId },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!project) return res.status(404).json(fail(40400, '报名项目不存在'));
  if (!project.isEnabled) return res.status(400).json(fail(40001, '该项目已停止报名'));
  if (project.deadline && new Date(project.deadline) < new Date()) {
    return res.status(400).json(fail(40001, '报名已截止'));
  }

  const existing = await prisma.projectRegistration.findUnique({
    where: { projectId_userId: { projectId, userId: req.user.userId } },
  });
  if (existing) return res.status(400).json(fail(40001, '您已报名，无需重复提交'));

  if (!realName || realName.trim().length === 0) return res.status(400).json(fail(40001, '请填写真实姓名'));
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) return res.status(400).json(fail(40001, '请填写正确的手机号'));

  const errors = [];
  const parsedAnswers = answers || {};
  for (const field of project.fields) {
    const value = parsedAnswers[field.id];
    if (field.required) {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        errors.push(`「${field.label}」为必填项`);
        continue;
      }
    }
    if (value !== undefined && value !== null && value !== '') {
      if (field.fieldType === 'FILE' && !isValidUrl(value)) {
        const urls = Array.isArray(value) ? value : [value];
        for (const v of urls) { if (!isValidUrl(v)) { errors.push(`「${field.label}」的文件地址无效`); break; } }
      }
      if (['SELECT', 'RADIO'].includes(field.fieldType)) {
        const opts = field.options ? JSON.parse(field.options) : [];
        if (!opts.includes(value)) errors.push(`「${field.label}」的选项值无效`);
      }
      if (field.fieldType === 'CHECKBOX' && Array.isArray(value)) {
        const opts = field.options ? JSON.parse(field.options) : [];
        for (const v of value) { if (!opts.includes(v)) { errors.push(`「${field.label}」含无效选项`); break; } }
      }
      if (field.fieldType === 'DATE' && isNaN(new Date(value).getTime())) {
        errors.push(`「${field.label}」的日期格式无效`);
      }
      if (field.validation) {
        const rules = typeof field.validation === 'string' ? JSON.parse(field.validation) : field.validation;
        errors.push(...applyCustomValidation(field.label, value, rules));
      }
    }
  }
  if (errors.length > 0) return res.status(400).json(fail(40001, errors.join('；')));

  const orderAmount = Number(project.price);
  const payStatus = orderAmount > 0 ? 'UNPAID' : 'FREE';

  let commissionRecord = null;
  if (channel && orderAmount > 0) {
    const ch = await prisma.channel.findUnique({ where: { code: channel } });
    if (ch && ch.isEnabled) {
      const rate = Number(ch.rate);
      const amount = Math.round(orderAmount * rate * 100) / 100;
      commissionRecord = { channelId: ch.id, rate, amount, orderAmount };
    }
  }

  const registration = await prisma.$transaction(async (tx) => {
    const reg = await tx.projectRegistration.create({
      data: { projectId, userId: req.user.userId, realName: realName.trim(), phone, channel: channel || null, answers: parsedAnswers, payStatus },
    });

    const fileAnswers = [];
    for (const field of project.fields) {
      const value = parsedAnswers[field.id];
      if (value !== undefined && value !== null && value !== '' && field.fieldType === 'FILE') {
        const urls = Array.isArray(value) ? value : [value];
        for (const url of urls) fileAnswers.push({ registrationId: reg.id, fieldId: field.id, value: url });
      }
    }
    if (fileAnswers.length > 0) await tx.projectRegistrationField.createMany({ data: fileAnswers });

    if (commissionRecord) {
      await tx.commissionRecord.create({
        data: { channelId: commissionRecord.channelId, projectId, registrationId: reg.id,
          orderAmount: commissionRecord.orderAmount, rate: commissionRecord.rate,
          amount: commissionRecord.amount, status: 'PENDING' },
      });
    }
    return reg;
  });

  res.status(201).json(success({
    id: registration.id, payStatus,
    commission: commissionRecord ? { channel, rate: commissionRecord.rate, amount: commissionRecord.amount } : null,
    message: orderAmount > 0 ? '报名成功，请在 24 小时内完成支付' : '报名成功',
  }));
}));

// ─── 获取我的报名 ──────────────────────────────────────────
router.get('/mine', auth, catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const list = await prisma.projectRegistration.findMany({
    where: { userId: req.user.userId },
    include: { project: { select: { id: true, title: true, coverImage: true, price: true, deadline: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(success(list.map(r => ({ ...r, price: Number(r.project.price) }))));
}));

// ─── 取消报名 ─────────────────────────────────────────────
router.delete('/mine/:projectId', auth, catchAsync(async (req, res) => {
  await checkNotBanned(req.user.userId);
  const projectId = Number(req.params.projectId);
  const registration = await prisma.projectRegistration.findUnique({
    where: { projectId_userId: { projectId, userId: req.user.userId } },
  });
  if (!registration) return res.status(404).json(fail(40400, '报名记录不存在'));

  await prisma.$transaction(async (tx) => {
    await tx.commissionRecord.deleteMany({ where: { registrationId: registration.id } });
    await tx.projectRegistration.delete({ where: { id: registration.id } });
  });
  res.json(success(null, '取消成功'));
}));

function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}
function applyCustomValidation(label, value, rules) {
  const errors = [];
  if (rules.minLength && String(value).length < rules.minLength) errors.push(`「${label}」长度不能少于 ${rules.minLength}`);
  if (rules.maxLength && String(value).length > rules.maxLength) errors.push(`「${label}」长度不能超过 ${rules.maxLength}`);
  if (rules.pattern && !new RegExp(rules.pattern).test(String(value))) errors.push(`「${label}」格式不符合要求`);
  if (rules.min !== undefined && Number(value) < rules.min) errors.push(`「${label}」不能小于 ${rules.min}`);
  if (rules.max !== undefined && Number(value) > rules.max) errors.push(`「${label}」不能大于 ${rules.max}`);
  return errors;
}

module.exports = router;
