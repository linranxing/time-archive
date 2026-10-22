/**
 * 管理员登录 / 退出（BE-06）
 * 契约 §六：登录失败 40102 / 未登录调退出 40101
 */
const router = require('express').Router();
const { login, logout } = require('../modules/BE-06/auth.service');
const { requireAdmin } = require('../middlewares/auth');
const { ok } = require('../middlewares/error');
const { SESSION } = require('../config/constants');

router.post('/api/admin/login', (req, res, next) => {
  try {
    const { sid, admin } = login(req.body && req.body.username, req.body && req.body.password);
    res.cookie(SESSION.cookie, sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION.ttlMs,
      path: '/',
    });
    return ok(res, admin);
  } catch (e) {
    return next(e);
  }
});

router.post('/api/admin/logout', requireAdmin, (req, res) => {
  logout(req.sessionId);
  res.clearCookie(SESSION.cookie, { path: '/' });
  return ok(res, { loggedOut: true });
});

module.exports = router;
