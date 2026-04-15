const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { success, catchAsync } = require('../utils/response');

const router = express.Router();
const prisma = new PrismaClient();

router.use(auth, requireRole('ADMIN')); // 仅管理员可操作

// ─── 获取网站设置 ─────────────────────────────────────────
router.get('/', catchAsync(async (req, res) => {
  const settings = await prisma.siteSetting.findMany({
    orderBy: { key: 'asc' },
  });
  // 转换为 key-value 对象
  const result = {};
  for (const s of settings) result[s.key] = s.value;
  res.json(success(result));
}));

// ─── 保存网站设置 ─────────────────────────────────────────
router.put('/', catchAsync(async (req, res) => {
  const { siteName, siteLogo, siteDescription, icpNumber, contactEmail, contactPhone } = req.body;
  
  const fields = { siteName, siteLogo, siteDescription, icpNumber, contactEmail, contactPhone };
  
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      await prisma.siteSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  }
  
  res.json(success(null, '网站设置已保存'));
}));

module.exports = router;