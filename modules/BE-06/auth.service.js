/**
 * BE-06 管理员鉴权模块
 * 职责：账号密码校验、会话维护、后台访问拦截
 * 实现：httpOnly Cookie + 进程内会话表（单进程单机部署，技术方案 §一.2）
 * 边界：仅管理员一种角色；不引入注册用户（N05 未获批）
 */
const crypto = require('crypto');
const { q, verifyPassword } = require('../../db');
const { AppError } = require('../../config/errors');
const { SESSION } = require('../../config/constants');

const sessions = new Map(); // sid -> { adminId, username, exp }

function sweep() {
  const now = Date.now();
  for (const [sid, s] of sessions) if (s.exp <= now) sessions.delete(sid);
}

/** 登录：失败统一 40102，不区分账号错误与密码错误 */
function login(username, password) {
  const name = (username || '').trim();
  const pwd = password || '';
  if (!name || !pwd) throw new AppError(40001, '请输入账号与密码');

  const row = q.get('SELECT * FROM admins WHERE username = ?', name);
  if (!row || !verifyPassword(pwd, row.passwordHash)) {
    throw new AppError(40102, '账号或密码错误');
  }

  sweep();
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { adminId: row.id, username: row.username, exp: Date.now() + SESSION.ttlMs });
  return { sid, admin: { adminId: row.id, username: row.username, role: 'admin' } };
}

function getSession(sid) {
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (s.exp <= Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return s;
}

function logout(sid) {
  if (sid) sessions.delete(sid);
}

module.exports = { login, getSession, logout, SESSION };
