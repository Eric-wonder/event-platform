const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth.middleware');
const { catchAsync } = require('../utils/catchAsync');
const { success, fail } = require('../utils/response');

const router = express.Router();

// ─── Multer 内存存储 ───────────────────────────────────────
const storage = multer.memoryStorage();

// 允许的图片类型
const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('图片格式仅支持 jpg/png/gif/webp/svg'), false);
};

// 允许的通用文件类型（表单字段用）
const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('不支持该文件格式，仅支持图片/PDF/Word/Excel/Zip'), false);
};

// 确保上传目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getUploadDir(sub = '') {
  const base = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
  return sub ? path.join(base, sub) : base;
}

// 生成唯一文件名
function genFilename(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const name = path.basename(originalname, ext).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
  return `${Date.now()}_${name}${ext}`;
}

// ─── 通用图片上传 ─────────────────────────────────────────
// POST /api/upload/image
router.post('/image', auth, multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter }).single('file'), catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json(fail(40001, '未上传文件'));
  const filename = genFilename(req.file.originalname);
  const dir = getUploadDir('images');
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);
  res.json(success({ url: `/uploads/images/${filename}` }));
}));

// ─── 通用文件上传（表单字段用，支持多文件）──────────────────
// POST /api/upload/file
router.post('/file', auth, multer({ storage, limits: { fileSize: 20 * 1024 * 1024 }, fileFilter }).array('files', 10), catchAsync(async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json(fail(40001, '未上传文件'));
  const dir = getUploadDir('files');
  ensureDir(dir);
  const urls = req.files.map(f => {
    const filename = genFilename(f.originalname);
    fs.writeFileSync(path.join(dir, filename), f.buffer);
    return `/uploads/files/${filename}`;
  });
  // 单文件直接返 URL，多文件返数组
  res.json(success(urls.length === 1 ? { url: urls[0] } : { urls }));
}));

// ─── 删除上传文件（清理用）────────────────────────────────
// DELETE /api/upload/file
router.delete('/file', auth, catchAsync(async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json(fail(40001, '缺少文件地址'));
  const relativePath = url.replace(/^\//, ''); // 去掉前导 /
  const fullPath = path.join(process.cwd(), relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    res.json(success(null, '文件已删除'));
  } else {
    res.json(success(null, '文件不存在，无需删除'));
  }
}));

module.exports = router;
