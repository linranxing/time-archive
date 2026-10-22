/**
 * 后台页面路由（EJS）：管理员登录 + 作品上传
 * 前台画廊首页 / 分类列表 / 作品详情在 routes/public.pages.js（子任务 B、C）
 * 注意：站点根路径 `/` 已由前台画廊接管，本文件不再重定向到后台
 */
const router = require('express').Router();
const { login, logout } = require('../modules/BE-06/auth.service');
const { requireAdminPage } = require('../middlewares/auth');
const { listCategories } = require('../modules/BE-04/category.service');
const { listCreators } = require('../modules/BE-05/creator.service');
const { SESSION } = require('../config/constants');

router.get('/admin/login', (req, res) => {
  res.render('login', { next: req.query.next || '/admin/upload', error: null });
});

router.post('/admin/login', (req, res) => {
  const next = req.body.next || '/admin/upload';
  try {
    const { sid } = login(req.body.username, req.body.password);
    res.cookie(SESSION.cookie, sid, { httpOnly: true, sameSite: 'lax', maxAge: SESSION.ttlMs, path: '/' });
    return res.redirect(next);
  } catch (e) {
    // 页面层直接把错误码渲染到表单上，不弹窗
    return res.status(e.http || 400).render('login', {
      next,
      error: { code: e.code, message: e.message },
    });
  }
});

router.post('/admin/logout', (req, res) => {
  logout(req.sessionId);
  res.clearCookie(SESSION.cookie, { path: '/' });
  res.redirect('/admin/login');
});

router.get('/admin/upload', requireAdminPage, (req, res) => {
  res.render('upload', {
    admin: req.admin,
    categories: listCategories(),
    creators: listCreators(),
    limits: { maxMB: 2, maxEdge: 1600 },
  });
});

module.exports = router;
