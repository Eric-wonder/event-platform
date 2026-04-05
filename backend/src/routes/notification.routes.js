const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth.middleware');
const { catchAsync } = require('../utils/catchAsync');
const { success, fail } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', auth, catchAsync(async (req, res) => {
  // 仅返回当前登录用户自己的通知
  const { page = 1, pageSize = 20 } = req.query;
  const [total, list] = await Promise.all([
    prisma.notification.count({ where: { userId: req.user.userId } }),
    prisma.notification.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
    }),
  ]);
  res.json(success({ list, total, page: Number(page), pageSize: Number(pageSize) }));
}));

router.get('/unread-count', auth, catchAsync(async (req, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user.userId, isRead: false },
  });
  res.json(success({ count }));
}));

router.patch('/:id/read', auth, catchAsync(async (req, res) => {
  // 仅允许本人操作
  const notif = await prisma.notification.findUnique({ where: { id: Number(req.params.id) } });
  if (!notif) return res.status(404).json(fail(40400, '通知不存在'));
  if (notif.userId !== req.user.userId) return res.status(403).json(fail(40300, '无权操作'));
  await prisma.notification.update({ where: { id: Number(req.params.id) }, data: { isRead: true } });
  res.json(success(null, '已标记为已读'));
}));

router.patch('/read-all', auth, catchAsync(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.userId, isRead: false },
    data: { isRead: true },
  });
  res.json(success(null, '全部已读'));
}));

module.exports = router;
