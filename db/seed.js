/**
 * 种子数据入口（幂等）：`npm run seed`
 * db/index.js 在 require 时已完成建表与首次灌数据，本脚本只做「把当前库里的基础数据打出来」的确认动作，
 * 方便首次跑通时核对分类 / 创作者 / 管理员账号是否就绪。
 * 说明：子任务 A 的权限边界只允许管理员写作品（N07），因此种子数据里不含任何前台用户表（N05 / CR-01 待审批）。
 */
const { q, DB_FILE } = require('./index');

const cats = q.all('SELECT id,name FROM categories ORDER BY sortOrder');
const creators = q.all('SELECT id,name FROM creators ORDER BY id');
const works = q.get('SELECT COUNT(*) AS n FROM works');
const admins = q.get('SELECT COUNT(*) AS n FROM admins');

console.log('数据库文件：' + DB_FILE);
console.log('分类 categories（%d）', cats.length);
cats.forEach((c) => console.log('  ' + c.id + '  ' + c.name));
console.log('创作者 creators（%d）', creators.length);
creators.forEach((c) => console.log('  ' + c.id + '  ' + c.name));
console.log('作品 works：%d 条', works.n);
console.log('管理员 admins：%d 个（默认 admin / admin12345）', admins.n);
