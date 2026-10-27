/**
 * 파일 역할: 본인인증(KCP), 회원가입, 로그인/로그아웃, 내 정보 API 컨트롤러.
 */
const { pool } = require('../config/database');
const kcp = require('../utils/kcpIdentity');
const { hashPassword, verifyPassword } = require('../utils/passwordHasher');
const { isAdult, parseBirthDate, displayAge } = require('../utils/adultPolicy');
const { HttpError, text, oneOf } = require('../utils/http');
const { cookieOptions, setSessionCookie, clearSessionCookie } = require('../middlewares/authMiddleware');

const KCP_NONCE_COOKIE = 'hgdc_kcp_tx';
const LOGIN_ID_PATTERN = /^[a-z0-9_]{4,20}$/;
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9_]{2,12}$/;
const SIGNUP_MEMBER_TYPES = ['player', 'business'];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskName(name = '') {
  if (name.length <= 1) return '*';
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`;
}

function siteOrigin(req) {
  return String(process.env.SITE_ORIGIN || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

// 같은 브라우저에서 시작한 본인인증인지 확인 (regCertKey 탈취 시 재사용 방지)
function getOwnedTransaction(req, regCertKey) {
  const transaction = kcp.getTransaction(regCertKey);
  if (!transaction || transaction.browserNonce !== req.cookies?.[KCP_NONCE_COOKIE]) {
    throw new HttpError(400, '본인인증 정보가 없거나 만료되었습니다. 다시 인증해주세요.');
  }
  return transaction;
}

async function requestIdentity(req, res) {
  const registration = await kcp.registerTransaction(req);
  res.cookie(KCP_NONCE_COOKIE, registration.browserNonce, cookieOptions(req, 15 * 60 * 1000));
  res.json({
    regCertKey: registration.regCertKey,
    callUrl: registration.callUrl,
    environment: registration.environment
  });
}

/** KCP 가 인증 완료 후 POST 하는 콜백 페이지. 팝업에서 열리며 opener 에게 결과(개인정보 제외)를 전달한다. */
async function kcpCallback(req, res) {
  const body = { ...(req.query || {}), ...(req.body || {}) };
  const regCertKey = String(body.reg_cert_key || '').trim();
  let result = { success: false, regCertKey, message: String(body.res_msg || '').trim() || '본인인증에 실패했습니다.' };

  if (String(body.res_cd || '').trim() === '0000' && regCertKey) {
    try {
      await kcp.fetchVerifiedIdentity(regCertKey, String(body.ordr_idxx || body.param_opt_1 || ''));
      result = { success: true, regCertKey, message: '본인인증이 완료되었습니다.' };
    } catch (error) {
      console.log('[KCP] 결과조회 실패', { message: error.message, detail: error.detail });
      result = { success: false, regCertKey, message: error.message };
    }
  }

  res.type('html').send(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>본인인증 결과</title></head>
<body style="font-family:sans-serif;padding:24px">
<p>${escapeHtml(result.message)}</p>
<script>
  (function () {
    var result = ${JSON.stringify(result).replace(/</g, '\\u003c')};
    var targetOrigin = ${JSON.stringify(siteOrigin(req))};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'HGDC_IDENTITY_RESULT', payload: result }, targetOrigin);
      setTimeout(function () { window.close(); }, 300);
    } else {
      location.replace('/signup?regCertKey=' + encodeURIComponent(result.regCertKey || '') + '&ok=' + (result.success ? '1' : '0'));
    }
  })();
</script>
</body></html>`);
}

/** 로컬 개발용 가짜 본인인증창 (KCP_CERT_ENV=mock && NODE_ENV!=production) */
function kcpMockPage(req, res) {
  if (kcp.getCertEnvironment() !== 'mock') return res.status(404).send('Not Found');
  const regCertKey = escapeHtml(req.body?.reg_cert_key || req.query.reg_cert_key || '');
  return res.type('html').send(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>[개발용] 가짜 본인인증</title></head>
<body style="font-family:sans-serif;padding:24px;max-width:360px">
<h3>[개발용] 가짜 본인인증</h3>
<form method="post" action="/kcp/mock/submit">
  <input type="hidden" name="reg_cert_key" value="${regCertKey}">
  <p><label>이름<br><input name="name" value="홍길동"></label></p>
  <p><label>생년월일(YYYYMMDD)<br><input name="birthDate" value="19990101"></label></p>
  <button type="submit">인증 완료</button>
</form>
<p style="color:#888;font-size:12px">2008년 이후 출생으로 넣으면 미성년자 차단을 확인할 수 있습니다.</p>
</body></html>`);
}

function kcpMockSubmit(req, res, next) {
  try {
    kcp.saveMockIdentity(req.body.reg_cert_key, req.body);
    req.body = { reg_cert_key: req.body.reg_cert_key, res_cd: '0000' };
    return kcpCallback(req, res);
  } catch (error) {
    return next(error);
  }
}

/** 팝업 완료 후 프론트가 호출: 마스킹된 인증 결과와 성인/중복가입 여부 */
async function getIdentityResult(req, res) {
  const transaction = getOwnedTransaction(req, req.params.regCertKey);
  if (!transaction.identity) return res.json({ verified: false });

  const { identity } = transaction;
  const [rows] = await pool.query('SELECT login_id FROM users WHERE ci_hash = ? LIMIT 1', [kcp.hashCi(identity.ci)]);
  const existingLoginId = rows[0]?.login_id || '';

  return res.json({
    verified: true,
    maskedName: maskName(identity.name),
    age: displayAge(identity.birthDate),
    isAdult: isAdult(identity.birthDate),
    alreadyRegistered: Boolean(existingLoginId),
    maskedLoginId: existingLoginId ? `${existingLoginId.slice(0, 3)}***` : ''
  });
}

async function signup(req, res) {
  const regCertKey = text(req.body.regCertKey, { required: true, label: '본인인증', max: 200 });
  const transaction = getOwnedTransaction(req, regCertKey);
  const identity = transaction.identity;
  if (!identity) throw new HttpError(400, '본인인증을 먼저 완료해주세요.');

  const birth = parseBirthDate(identity.birthDate);
  if (!birth || !isAdult(identity.birthDate)) {
    kcp.consumeTransaction(regCertKey);
    throw new HttpError(403, '호구닷컴은 만 19세 이상(청소년보호법 기준)만 가입할 수 있습니다.');
  }

  const loginId = text(req.body.loginId, { required: true, label: '아이디', max: 20 }).toLowerCase();
  const password = String(req.body.password || '');
  const nickname = text(req.body.nickname, { required: true, label: '닉네임', max: 12 });
  const memberType = oneOf(req.body.memberType, SIGNUP_MEMBER_TYPES, null);

  if (!LOGIN_ID_PATTERN.test(loginId)) throw new HttpError(400, '아이디는 영문 소문자/숫자/_ 4~20자입니다.');
  if (password.length < 8 || password.length > 64) throw new HttpError(400, '비밀번호는 8~64자로 입력해주세요.');
  if (!NICKNAME_PATTERN.test(nickname)) throw new HttpError(400, '닉네임은 한글/영문/숫자 2~12자입니다.');
  if (!memberType) throw new HttpError(400, '회원 유형(선수/업소)을 선택해주세요.');
  if (req.body.agreeTerms !== true || req.body.agreePrivacy !== true) {
    throw new HttpError(400, '이용약관과 개인정보 처리방침에 동의해주세요.');
  }

  let userId;
  try {
    const [result] = await pool.query(
      `INSERT INTO users (login_id, password_hash, nickname, member_type, ci_hash, real_name, birth_date, gender, phone, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [loginId, await hashPassword(password), nickname, memberType, kcp.hashCi(identity.ci),
        identity.name, birth.iso, identity.gender, identity.phone]
    );
    userId = result.insertId;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('uk_users_ci_hash')) throw new HttpError(409, '이미 가입된 회원입니다. (1인 1계정)');
      if (error.message.includes('uk_users_nickname')) throw new HttpError(409, '이미 사용 중인 닉네임입니다.');
      throw new HttpError(409, '이미 사용 중인 아이디입니다.');
    }
    throw error;
  }

  kcp.consumeTransaction(regCertKey);
  res.clearCookie(KCP_NONCE_COOKIE, cookieOptions(req, undefined));
  setSessionCookie(req, res, { id: userId, member_type: memberType });
  res.status(201).json({ id: userId, nickname, memberType });
}

// 아이디+IP 기준 단순 로그인 시도 제한 (프로세스 메모리. 다중 인스턴스면 Redis 등으로 교체)
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function checkLoginRateLimit(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, startedAt: now });
    return;
  }
  entry.count += 1;
  if (entry.count > LOGIN_MAX_ATTEMPTS) throw new HttpError(429, '로그인 시도가 너무 많습니다. 10분 후 다시 시도해주세요.');
}

async function login(req, res) {
  const loginId = text(req.body.loginId, { required: true, label: '아이디', max: 30 }).toLowerCase();
  const password = String(req.body.password || '');
  const rateKey = `${req.ip}:${loginId}`;
  checkLoginRateLimit(rateKey);

  const [rows] = await pool.query(
    'SELECT id, password_hash, nickname, member_type, birth_date, status FROM users WHERE login_id = ? LIMIT 1',
    [loginId]
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  if (user.status !== 'active') throw new HttpError(403, '이용이 제한된 계정입니다. 고객센터에 문의해주세요.');

  loginAttempts.delete(rateKey);
  await pool.query('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
  setSessionCookie(req, res, user);
  res.json({ id: user.id, nickname: user.nickname, memberType: user.member_type });
}

function logout(req, res) {
  clearSessionCookie(req, res);
  res.json({ ok: true });
}

function me(req, res) {
  if (!req.user) return res.json({ user: null });
  return res.json({
    user: {
      id: req.user.id,
      loginId: req.user.login_id,
      nickname: req.user.nickname,
      memberType: req.user.member_type
    }
  });
}

module.exports = {
  requestIdentity,
  kcpCallback,
  kcpMockPage,
  kcpMockSubmit,
  getIdentityResult,
  signup,
  login,
  logout,
  me
};
