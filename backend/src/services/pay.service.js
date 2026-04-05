/**
 * 微信支付服务
 *
 * 依赖：
 *   - wechatpay-node-v3 (npm install wechatpay-node-v3)
 *
 * 环境变量配置：
 *   WX_MCHID       商户号
 *   WX_SERIAL_NO   商户证书序列号
 *   WX_PRIVATE_KEY 商户私钥（rsa.pem 内容，或文件路径）
 *   WX_APIV3_KEY   APIv3 密钥
 *   WX_APPID       公众号/小程序 AppID（JSAPI 时必填）
 *   - 或 -
 *   WX_SANDBOX     设为 1 启用沙箱模式（自动调用沙箱接口）
 *
 * 沙箱模式：无须真实商户号，生成模拟数据用于开发调试
 */
const crypto = require('crypto');
const https = require('https');
const axios = require('axios').default;
const { PrismaClient } = require('@prisma/client');

// ─── 配置 ────────────────────────────────────────────────
const prisma = new PrismaClient();

const CFG = {
  mchid:      process.env.WX_MCHID       || '',
  serialNo:   process.env.WX_SERIAL_NO   || '',
  privateKey: resolvePrivateKey(process.env.WX_PRIVATE_KEY || ''),
  apiv3Key:   process.env.WX_APIV3_KEY   || '',
  appid:      process.env.WX_APPID        || '',
  sandbox:    process.env.WX_SANDBOX      === '1',
  /** 微信支付 API 基础路径 */
  baseUrl: process.env.WX_API_BASE || 'https://api.mch.weixin.qq.com',
};

function resolvePrivateKey(key) {
  if (!key) return '';
  if (key.includes('BEGIN PRIVATE KEY')) return key;
  // 支持传入文件路径
  try { return require('fs').readFileSync(key, 'utf8'); } catch { return key; }
}

// ─── 是否沙箱 / 模拟模式 ─────────────────────────────────
function isMockMode() {
  return !CFG.mchid || !CFG.apiv3Key || CFG.sandbox;
}

// ─── 生成商户订单号 ────────────────────────────────────────
function genOutTradeNo(prefix = 'REG') {
  const ts = Date.now().toString();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}${ts}${rand}`;
}

// ─── 订单过期时间（默认 30 分钟）──────────────────────────
function getExpireTime(minutes = 30) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

// ─── 生成 HMAC-SHA256 签名（模拟模式用）───────────────────
function hmacSha256(data, key) {
  return crypto.createHmac('sha256', key).update(data).digest('hex').toUpperCase();
}

// ─── 生成微信支付签名（APIv3）──────────────────────────────
function signApiV3(method, url, body, timestamp, nonce) {
  if (!CFG.privateKey) return '';
  const signStr = `${method}\n${url}\n${timestamp}\n${nonce}\n${body || ''}\n`;
  return crypto.createSign('RSA-SHA256').update(signStr).sign(CFG.privateKey, 'base64');
}

// ─── 通用请求封装 ─────────────────────────────────────────
async function wxRequest(method, path, body, options = {}) {
  if (isMockMode()) {
    return mockResponse(path, body);
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyStr = body ? JSON.stringify(body) : '';
  const signature = signApiV3(method, path, bodyStr, timestamp, nonce);
  const auth = `WECHATPAY2-SHA256-RSA2048 mchid="${CFG.mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${CFG.serialNo}"`;

  const baseURL = CFG.sandbox ? `${CFG.baseUrl}/sandboxnew` : CFG.baseURL;
  const url = `${CFG.baseUrl}${path}`;

  const resp = await axios({ method, url, headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' }, data: body ? body : undefined, timeout: 15000 });
  return resp.data;
}

// ─── 模拟响应（无商户号时）────────────────────────────────
async function mockResponse(path, body) {
  const outTradeNo = body?.out_trade_no;
  const tradeType = body?.trade_type || 'NATIVE';
  const amount = body?.total?.total || 0;

  // 统一下单 mock
  if (path.includes('pay/transactions')) {
    if (tradeType === 'NATIVE') {
      return {
        code: 'SUCCESS',
        message: '成功',
        result_code: 'SUCCESS',
        trade_type: 'NATIVE',
        out_trade_no: outTradeNo,
        // NATIVE 模式：返回支付链接（二维码内容）
        code_url: `weixin://wxpay/bizpayurl?pr=${encodeURIComponent(outTradeNo)}`,
      };
    }
    if (tradeType === 'JSAPI') {
      return {
        code: 'SUCCESS',
        message: '成功',
        prepay_id: `wx${Date.now()}prepayidmock`,
        out_trade_no: outTradeNo,
      };
    }
    return { code: 'SUCCESS', out_trade_no: outTradeNo };
  }

  // 查单 mock
  if (path.includes('pay/query')) {
    return {
      trade_state: 'SUCCESS',
      out_trade_no: outTradeNo,
      transaction_id: `wx${Date.now()}txnmock`,
      trade_state_desc: '支付成功',
      amount: { total: amount, payer_total: amount },
      success_time: new Date().toISOString(),
    };
  }

  return { code: 'SUCCESS' };
}

// ══════════════════════════════════════════════════════
// 核心接口
// ══════════════════════════════════════════════════════

/**
 * 统一下单（Native 扫码支付）
 * 用于 PC 网页：生成支付二维码链接
 *
 * @param {Object} opts
 * @param {number} opts.registrationId  报名记录 ID
 * @param {number} opts.userId          用户 ID
 * @param {string} opts.title           商品描述（例：报名费-XXX项目）
 * @param {number} opts.amount           金额（元），整数或小数均可
 * @param {string} opts.notifyUrl        回调通知地址
 * @returns {Promise<{codeUrl, outTradeNo, expireTime, mock}>}
 */
async function createNativeOrder({ registrationId, userId, title, amount, notifyUrl }) {
  const outTradeNo = genOutTradeNo('REG');
  const expireAt = getExpireTime(30); // 30 分钟后过期

  // 1. 创建本地支付订单
  const order = await prisma.payOrder.create({
    data: {
      outTradeNo,
      registrationId,
      userId,
      amount,
      tradeType: 'NATIVE',
      expireAt,
      payStatus: 'PENDING',
    },
  });

  // 2. 调用微信支付统一下单 API
  const result = await wxRequest('POST', '/v3/pay/transactions/native', {
    mchid:       CFG.mchid || 'mock_mchid',
    out_trade_no: outTradeNo,
    appid:       CFG.appid || 'mock_appid',
    description: title,
    notify_url:  notifyUrl,
    amount: {
      total:       Math.round(amount * 100), // 微信以分为单位
      currency:    'CNY',
    },
    time_expire: formatTime(expireAt),
  });

  const codeUrl = result.code_url || result.prepay_id;
  await prisma.payOrder.update({
    where: { id: order.id },
    data: { codeUrl: codeUrl || null, prepayId: result.prepay_id || null },
  });

  return {
    id: order.id,
    outTradeNo,
    codeUrl,
    prepayId: result.prepay_id,
    amount,
    expireAt,
    mock: isMockMode(),
  };
}

/**
 * 统一下单（JSAPI 公众号/小程序支付）
 * 用于微信内置浏览器：返回支付参数供前端调起支付
 *
 * @param {string} openid  用户在公众号下的 OpenID
 */
async function createJsapiOrder({ registrationId, userId, title, amount, notifyUrl, openid }) {
  if (!openid) throw new Error('JSAPI 支付必须提供 openid');

  const outTradeNo = genOutTradeNo('REG');
  const expireAt = getExpireTime(30);

  const order = await prisma.payOrder.create({
    data: {
      outTradeNo,
      registrationId,
      userId,
      amount,
      tradeType: 'JSAPI',
      expireAt,
      payStatus: 'PENDING',
    },
  });

  const result = await wxRequest('POST', '/v3/pay/transactions/jsapi', {
    mchid:       CFG.mchid,
    out_trade_no: outTradeNo,
    appid:       CFG.appid,
    description: title,
    notify_url:  notifyUrl,
    openid,
    amount: {
      total:    Math.round(amount * 100),
      currency: 'CNY',
    },
    time_expire: formatTime(expireAt),
  });

  // JSAPI 返回 prepay_id，前端据此调起支付
  const paySign = signJsapiPaySign(result.prepay_id);

  await prisma.payOrder.update({
    where: { id: order.id },
    data: { prepayId: result.prepay_id },
  });

  return {
    id: order.id,
    outTradeNo,
    prepayId: result.prepay_id,
    paySign,
    amount,
    expireAt,
    mock: isMockMode(),
  };
}

/**
 * 查询订单支付状态
 */
async function queryOrder(outTradeNo) {
  if (isMockMode()) {
    const order = await prisma.payOrder.findUnique({ where: { outTradeNo } });
    if (!order) return null;
    return {
      outTradeNo,
      status: order.payStatus,
      transactionId: order.transactionId,
      paidAt: order.paidAt,
    };
  }

  const resp = await wxRequest('GET', `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${CFG.mchid}`);
  return {
    outTradeNo,
    status: mapTradeState(resp.trade_state),
    transactionId: resp.transaction_id,
    paidAt: resp.success_time ? new Date(resp.success_time) : null,
    tradeStateDesc: resp.trade_state_desc,
  };
}

/**
 * 关闭订单
 */
async function closeOrder(outTradeNo) {
  if (isMockMode()) {
    await prisma.payOrder.updateMany({
      where: { outTradeNo, payStatus: 'PENDING' },
      data: { payStatus: 'CLOSED' },
    });
    return;
  }
  await wxRequest('POST', `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`, {
    mchid: CFG.mchid,
  });
}

/**
 * 申请退款（预留接口）
 */
async function refundOrder(outTradeNo, amount, reason = '') {
  if (isMockMode()) {
    await prisma.payOrder.updateMany({
      where: { outTradeNo, payStatus: 'SUCCESS' },
      data: { payStatus: 'REFUNDED' },
    });
    return { refund_id: `mock_refund_${outTradeNo}`, mock: true };
  }
  // 微信退款 API：POST /v3/refund/domestic/refunds
  // （省略实现细节，商户号审核后再填入）
  throw new Error('退款接口需在正式商户号审核通过后实现');
}

// ══════════════════════════════════════════════════════
// 回调处理（由 pay.routes.js 调用）
// ══════════════════════════════════════════════════════

/**
 * 验证微信支付回调签名
 * @param {Buffer} body  原始请求体
 * @param {string} sig   HTTP Header Wechatpay-Signature
 * @param {string} t     HTTP Header Wechatpay-Timestamp
 * @param {string} n     HTTP Header Wechatpay-Nonce
 * @returns {boolean}
 */
function verifyCallbackSignature(body, sig, t, n) {
  if (isMockMode()) return true; // 沙箱模式跳过验证
  const msg = `${t}\n${n}\n${body.toString()}\n`;
  const expected = hmacSha256(msg, CFG.apiv3Key);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/**
 * 处理微信支付回调
 * 返回 { success: true/false, message }
 */
async function handleNotify(rawBody, headers) {
  const { Wechatpay-Signature: sig, Wechatpay-Timestamp: t, Wechatpay-Nonce: n } = headers;

  if (!verifyCallbackSignature(rawBody, sig, t, n)) {
    console.error('[WeChatPay] 回调签名验证失败');
    return { success: false, message: '签名验证失败' };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { success: false, message: 'JSON 解析失败' };
  }

  const { event_type, resource } = payload;
  if (!resource) return { success: false, message: '无效回调数据' };

  // 解密资源（微信支付 v3 使用 AES-256-GCM 解密）
  const decrypted = decryptResource(resource);
  const { out_trade_no, transaction_id, trade_state, success_time, amount } = decrypted;

  console.log(`[WeChatPay] 回调: ${out_trade_no} -> ${trade_state}`);

  const order = await prisma.payOrder.findUnique({ where: { outTradeNo: out_trade_no } });
  if (!order) {
    console.warn(`[WeChatPay] 未找到订单: ${out_trade_no}`);
    return { success: false, message: '订单不存在' };
  }

  if (order.payStatus === 'SUCCESS') {
    return { success: true, message: '已处理' }; // 幂等
  }

  if (trade_state === 'SUCCESS') {
    await prisma.$transaction(async (tx) => {
      await tx.payOrder.update({
        where: { id: order.id },
        data: {
          payStatus: 'SUCCESS',
          transactionId: transaction_id,
          paidAt: success_time ? new Date(success_time) : new Date(),
          notifyData: rawBody.toString('utf8'),
        },
      });
      // 更新报名记录支付状态
      await tx.projectRegistration.update({
        where: { id: order.registrationId },
        data: { payStatus: 'PAID' },
      });
      // 发通知给报名者
      await tx.notification.create({
        data: {
          userId: order.userId,
          title: '💰 支付成功',
          content: `您的报名费用已支付成功，交易单号：${transaction_id}`,
          type: 'pay_success', refId: order.registrationId,
        },
      });
    });
    return { success: true, message: '支付成功处理完成' };
  }

  if (['PAYCLOSED', 'REFUND'].includes(trade_state)) {
    await prisma.payOrder.update({
      where: { id: order.id },
      data: { payStatus: trade_state === 'PAYCLOSED' ? 'CLOSED' : 'REFUNDED', notifyData: rawBody.toString('utf8') },
    });
  }

  return { success: true, message: `已处理(${trade_state})` };
}

/**
 * AES-256-GCM 解密（微信支付 v3 回调资源解密）
 */
function decryptResource(resource) {
  if (isMockMode()) return JSON.parse(Buffer.from(resource.ciphertext, 'base64').toString('utf8'));

  const key = crypto.createHash('sha256').update(CFG.apiv3Key).digest();
  const nonce = Buffer.from(resource.nonce, 'base64');
  const ciphertext = Buffer.from(resource.ciphertext, 'base64');
  const tag = Buffer.from(resource.authentication_tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// ─── JSAPI 调起支付签名（前端用）──────────────────────────
function signJsapiPaySign(prepayId) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const msg = `${CFG.appid}\n${timestamp}\n${nonceStr}\n${prepayId}\n`;
  return crypto.createSign('RSA-SHA256').update(msg).sign(CFG.privateKey, 'base64');
}

// ─── 工具函数 ────────────────────────────────────────────
function formatTime(date) {
  const pad = n => String(n).padStart(2, '0');
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
}

function mapTradeState(state) {
  const map = {
    SUCCESS:    'SUCCESS',
    PAYCLOSED:  'CLOSED',
    REFUND:     'REFUNDED',
    NOTPAY:     'PENDING',
    USERPAYING: 'PENDING',
    PAYERROR:   'FAILED',
  };
  return map[state] || state;
}

module.exports = {
  isMockMode,
  createNativeOrder,
  createJsapiOrder,
  queryOrder,
  closeOrder,
  refundOrder,
  handleNotify,
  verifyCallbackSignature,
  genOutTradeNo,
};
