const jwt = require('jsonwebtoken');
const { fail } = require('../utils/response');

/**
 * 登录认证中间件
 * 验证 Authorization: Bearer <token>
 * 解析后挂载 req.user = { userId, role }
 */
const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json(fail(40100, '请先登录'));
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json(fail(40100, '登录已过期，请重新登录'));
    }
    return res.status(401).json(fail(40100, 'Token 无效'));
  }
};

/**
 * 可选认证：有 token 则解析，无 token 也放行
 */
const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
};

/**
 * 角色权限中间件
 * 用法: requireRole('ADMIN')
 *       requireRole('ADMIN', 'CHANNEL_MANAGER')
 *
 * 校验顺序：
 * 1. 未登录 → 401
 * 2. 角色不匹配 → 403
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(fail(40100, '请先登录'));
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json(fail(40300, '权限不足'));
    }
    next();
  };
};

/**
 * 超级管理员专属中间件（requireRole('ADMIN') 的别名，更语义化）
 */
const requireAdmin = requireRole('ADMIN');

/**
 * 超级管理员或组织者中间件
 */
const requireOrganizer = requireRole('ORGANIZER', 'ADMIN');

/**
 * 超级管理员或渠道管理员中间件
 */
const requireChannelMgr = requireRole('ADMIN', 'CHANNEL_MANAGER');

module.exports = { auth, optionalAuth, requireRole, requireAdmin, requireOrganizer, requireChannelMgr };
