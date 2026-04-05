/**
 * 微信支付路由
 *
 * 路由清单：
 *   POST /api/pay/native         创建扫码支付订单
 *   POST /api/pay/jsapi         创建 JSAPI 支付订单（需 openid）
 *   GET  /api/pay/status/:outTradeNo  查询支付状态
 *   POST /api/pay/close/:outTradeNo  关闭订单
 *   GET  /api/pay/qr/:outTradeNo     生成支付二维码（PNG base64）
 *   POST /api/pay/notify            微信支付回调（无需认证，raw body）
 *   GET  /api/pay/orders            当前用户的支付订单列表
 *
 * 安全说明：
 *   - 订单创建需登录（auth）
 *   - 支付状态查询需登录（auth + 本人订单校验）
 *   - 回调通知无需认证，但有签名验证
 */
const express = require('express');
const { auth } = require('../middleware/auth.middleware');
const { catchAsync } = require('../utils/catchAsync');
const { success, fail } = require('../utils/response');
const {
  createNativeOrder, createJsapiOrder, queryOrder, closeOrder,
  handleNotify, isMockMode, genOutTradeNo,
} = require('../services/pay.service');

const router = express.Router();

// ─── 创建扫码支付（Native）────────────────────────────────
// POST /api/pay/native
// Body: { registrationId, title, amount }
// 返回: { codeUrl, outTradeNo, qrImage, expireAt, mock }
router.post('/native', auth, catchAsync(async (req, res) => {
  const { registrationId, title, amount } = req.body;

  if (!registrationId || !title || amount === undefined) {
    return res.status(400).json(fail(40001, '缺少必要参数 registrationId / title / amount'));
  }
  if (amount < 0) return res.status(400).json(fail(40001, '金额不能为负'));
  if (amount > 100000) return res.status(400).json(fail(40001, '金额超出限制（单笔≤10万元）'));

  // 回调地址：生产环境需填写实际域名
  const notifyUrl = process.env.WX_PAY_NOTIFY_URL
    || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/api/pay/notify`;

  const result = await createNativeOrder({
    registrationId, userId: req.user.userId,
    title, amount, notifyUrl,
  });

  // 生成二维码图片（SVG 转 PNG base64）
  let qrImage = null;
  if (result.codeUrl) {
    try {
      const QRCode = require('qrcode');
      qrImage = await QRCode.toDataURL(result.codeUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        margin: 2,
        width: 256,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (qrErr) {
      console.warn('[Pay] QR 生成失败:', qrErr.message);
    }
  }

  res.json(success({
    outTradeNo: result.outTradeNo,
    codeUrl: result.codeUrl,
    qrImage,
    amount: result.amount,
    expireAt: result.expireAt,
    mock: result.mock,
    mockMode: isMockMode() ? '当前为沙箱/模拟模式，请配置 WX_MCHID / WX_APIV3_KEY 切换正式模式' : null,
  }));
}));

// ─── 创建 JSAPI 支付（需 openid）─────────────────────────
// POST /api/pay/jsapi
// Body: { registrationId, title, amount, openid }
// 返回: { prepayId, paySign, timeStamp, nonceStr, mock }
router.post('/jsapi', auth, catchAsync(async (req, res) => {
  const { registrationId, title, amount, openid } = req.body;

  if (!registrationId || !title || amount === undefined) {
    return res.status(400).json(fail(40001, '缺少必要参数'));
  }

  const notifyUrl = process.env.WX_PAY_NOTIFY_URL
    || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/api/pay/notify`;

  try {
    const result = await createJsapiOrder({
      registrationId, userId: req.user.userId,
      title, amount, notifyUrl, openid,
    });
    res.json(success(result));
  } catch (err) {
    if (err.message.includes('openid')) {
      return res.status(400).json(fail(40001, 'JSAPI 支付需要 openid，请先完成微信授权登录'));
    }
    throw err;
  }
}));

// ─── 查询支付状态（轮询）────────────────────────────────
// GET /api/pay/status/:outTradeNo
router.get('/status/:outTradeNo', auth, catchAsync(async (req, res) => {
  const { outTradeNo } = req.params;

  const result = await queryOrder(outTradeNo);
  if (!result) return res.status(404).json(fail(40400, '订单不存在'));

  // 权限校验：仅订单用户可查
  const order = await require('../@prisma/client').PrismaClient.prototype.constructor
    ? (() => { const { PrismaClient } = require('@prisma/client'); return new PrismaClient(); })()
    : null;

  // 直接查询（避免 PrismaClient 重复实例化）
  const { default: Prisma } = await import('@prisma/client');
  const prisma = new Prisma();
  const payOrder = await prisma.payOrder.findUnique({ where: { outTradeNo }, select: { userId: true, payStatus: true } });
  if (!payOrder) return res.status(404).json(fail(40400, '订单不存在'));
  if (payOrder.userId !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无权查询此订单'));
  }

  res.json(success({ ...result, localStatus: payOrder.payStatus }));
}));

// ─── 关闭待支付订单 ────────────────────────────────────
// POST /api/pay/close/:outTradeNo
router.post('/close/:outTradeNo', auth, catchAsync(async (req, res) => {
  const { outTradeNo } = req.params;

  const { default: Prisma } = await import('@prisma/client');
  const prisma = new Prisma();
  const order = await prisma.payOrder.findUnique({ where: { outTradeNo }, select: { userId: true } });
  if (!order) return res.status(404).json(fail(40400, '订单不存在'));
  if (order.userId !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json(fail(40300, '无权操作'));
  }

  await closeOrder(outTradeNo);
  res.json(success(null, '订单已关闭'));
}));

// ─── 生成支付二维码图片 ─────────────────────────────────
// GET /api/pay/qr/:outTradeNo
// 返回 PNG 图片流（Content-Type: image/png）
router.get('/qr/:outTradeNo', catchAsync(async (req, res) => {
  const { outTradeNo } = req.params;
  const { default: Prisma } = await import('@prisma/client');
  const prisma = new Prisma();
  const order = await prisma.payOrder.findUnique({ where: { outTradeNo }, select: { codeUrl: true, payStatus: true } });
  if (!order) return res.status(404).json(fail(40400, '订单不存在'));
  if (!order.codeUrl) return res.status(400).json(fail(40001, '该订单无二维码'));

  const QRCode = require('qrcode');
  const buffer = await QRCode.toBuffer(order.codeUrl, { errorCorrectionLevel: 'M', type: 'png', margin: 2, width: 300 });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}));

// ─── 微信支付回调通知 ────────────────────────────────────
// POST /api/pay/notify
// ⚠️ 此接口无需认证，但 Express 默认会解析 JSON body
// 微信要求接收 raw body 用于验签，详见 pay.service.js
router.post('/notify', express.raw({ type: 'application/json' }), catchAsync(async (req, res) => {
  // req.body 此时为 Buffer（因为用了 express.raw）
  const headers = {
    'Wechatpay-Signature': req.headers['wechatpay-signature'],
    'Wechatpay-Timestamp': req.headers['wechatpay-timestamp'],
    'Wechatpay-Nonce':     req.headers['wechatpay-nonce'],
  };

  const result = await handleNotify(req.body, headers);

  // 微信要求返回 200 + SUCCESS 状态码，否则会重复通知
  if (result.success) {
    res.status(200).json({ code: 'SUCCESS', message: result.message });
  } else {
    res.status(400).json({ code: 'FAIL', message: result.message });
  }
}));

// ─── 当前用户的支付订单列表 ────────────────────────────────
// GET /api/pay/orders
router.get('/orders', auth, catchAsync(async (req, res) => {
  const { default: Prisma } = await import('@prisma/client');
  const prisma = new Prisma();
  const { page = 1, pageSize = 10, status } = req.query;

  const where = { userId: req.user.userId };
  if (status) where.payStatus = status;

  const [total, list] = await Promise.all([
    prisma.payOrder.count({ where }),
    prisma.payOrder.findMany({
      where,
      include: {
        registration: {
          select: {
            id: true,
            project: { select: { id: true, title: true } },
          },
        },
      },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const formatted = list.map(o => ({
    id: o.id,
    outTradeNo: o.outTradeNo,
    transactionId: o.transactionId,
    amount: Number(o.amount),
    tradeType: o.tradeType,
    payStatus: o.payStatus,
    paidAt: o.paidAt,
    expireAt: o.expireAt,
    createdAt: o.createdAt,
    project: o.registration?.project,
  }));

  res.json(success({ list: formatted, total, page: Number(page), pageSize: Number(pageSize) }));
}));

module.exports = router;
