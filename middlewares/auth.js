/**
 * BE-09 公共支撑 · 会话中间件
 * 解析 Cookie 中的会话号，挂载 req.admin；后台接口统一用 requireAdmin 拦截（40101）
 */
const { SESSION } = require('../config/constants');
const { getSession } = require('../modules/BE-06/auth.service');
const { AppError } = require('../config/errors');

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i <= 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch (_) {
      out[k] = v;
    }
  });
  return out;
}

/** 只识别登录态，不做拦截 */
function attachSession(req, _res, next) {
  let sid = parseCookies(req.headers.cookie || '')[SESSION.cookie];
  const sess = getSession(sid);
  req.sessionId = sess ? sid : null;
  req.admin = sess ? { adminId: sess.adminId, username: sess.username, role: 'admin' } : null;
  next();
}

/** 接口用：未登录即 40101 */
function requireAdmin(req, _res, next) {
  if (!req.admin) return next(new AppError(40101, '未登录或会话已失效'));
  next();
}

/** 页面用：未登录跳登录页并带回跳地址 */
function requireAdminPage(req, res, next) {
  if (!req.admin) return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
  next();
}

module.exports = { attachSession, requireAdmin, requireAdminPage, parseCookies, SESSION };
