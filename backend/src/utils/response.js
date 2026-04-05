/**
 * 统一响应工具
 */

/**
 * 成功响应
 * @param {any} data 数据
 * @param {string} message 提示信息
 */
const success = (data, message = 'ok') => ({
  code: 0,
  message,
  data,
});

/**
 * 失败响应
 * @param {number} code 错误码
 * @param {string} message 错误信息
 * @param {Array}  errors 详细错误列表（可选）
 */
const fail = (code, message, errors = null) => {
  const body = { code, message };
  if (errors) body.errors = errors;
  return body;
};

/**
 * Express 错误处理中间件（必须接受 4 个参数）
 */
const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err);

  // Prisma 唯一约束冲突
  if (err.code === 'P2002') {
    return res.status(409).json(fail(40900, '数据已存在，请勿重复提交'));
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(fail(40100, 'Token 无效'));
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json(fail(40100, '登录已过期'));
  }

  // Multer 文件过大
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json(fail(41300, '文件大小超出限制'));
  }

  // Zod 验证错误（已由路由自行处理，此处兜底）
  if (err.name === 'ZodError') {
    return res.status(400).json(fail(40001, '参数校验失败', err.errors));
  }

  // 默认 500
  res.status(500).json(fail(50000, process.env.NODE_ENV === 'production'
    ? '服务器内部错误'
    : err.message));
};

/**
 * 异步路由包装器，捕获未处理的 Promise 错误
 */
const catchAsync = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { success, fail, errorHandler, catchAsync };
