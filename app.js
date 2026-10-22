/**
 * 时序档案馆 · 应用入口
 * 单进程单机：Express 4 同时托管页面（EJS）、接口与静态资源
 * 已实现范围：A 管理员新增作品 / B 分类作品列表 / C 单条作品详情
 */
const path = require('path');
const express = require('express');

const { PORT, PATH } = require('./config/constants');
const { attachSession } = require('./middlewares/auth');
const { errorHandler } = require('./middlewares/error');

const adminWorksRouter = require('./routes/admin.works');
const authRouter = require('./routes/auth');
const metaRouter = require('./routes/meta');
const worksRouter = require('./routes/works');
const publicPagesRouter = require('./routes/public.pages');
const pagesRouter = require('./routes/pages');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(attachSession);

// 静态资源：作品三档图片可长缓存；样式 / 脚本不缓存，避免联调时改完 CSS 看不到效果
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), { maxAge: '1h' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: true }));

// 接口
app.use(authRouter);
app.use(metaRouter);
app.use(adminWorksRouter);
app.use(worksRouter);

// 页面：前台画廊 / 详情（B、C）→ 后台管理页（A）
app.use(publicPagesRouter);
app.use(pagesRouter);

// 统一错误处理（必须放在最后）
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`时序档案馆已启动：http://localhost:${PORT}/`);
    console.log(`管理后台：http://localhost:${PORT}/admin/upload`);
    console.log(`数据库：${PATH.dbFile}`);
  });
}

module.exports = app;
