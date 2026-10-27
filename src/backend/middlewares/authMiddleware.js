/**
 * 파일 역할: 세션 쿠키(JWT) 해석과 로그인/권한 검사 미들웨어.
 *
 * 목록은 비회원에게 공개하고, 상세 내용·연락처·작성 기능에만 requireMember 를 건다.
 * (가입 시 KCP 본인인증 + 성인 판정을 통과한 계정만 존재하므로 로그인 = 성인 인증 완료)
 */
const jwt = require('../utils/jwt');
const { pool } = require('../config/database');

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'hgdc_session';

function parseCookies(header = '') {
  return String(header || '').split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return cookies;
  }, {});
}

function cookieOptions(req, maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: maxAgeMs
  };
}

function setSessionCookie(req, res, user) {
  const expiresIn = Number(process.env.JWT_EXPIRES_IN_SECONDS) || 7 * 24 * 60 * 60;
  const token = jwt.sign({ sub: user.id, type: user.member_type }, expiresIn);
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(req, expiresIn * 1000));
}

function clearSessionCookie(req, res) {
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions(req, undefined));
}

// 매 요청마다 DB 에서 상태를 확인해 정지/탈퇴 계정을 즉시 차단한다.
async function attachUser(req, _res, next) {
  try {
    req.cookies = parseCookies(req.headers.cookie);
    const payload = jwt.verify(req.cookies[SESSION_COOKIE_NAME]);
    if (!payload?.sub) return next();

    const [rows] = await pool.query(
      `SELECT id, login_id, nickname, member_type, birth_date, status
         FROM users WHERE id = ? LIMIT 1`,
      [payload.sub]
    );
    if (rows[0]?.status === 'active') req.user = rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireMember(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: '19세 이상 본인인증 회원만 볼 수 있는 내용입니다. 로그인해주세요.', code: 'LOGIN_REQUIRED' });
  }
  return next();
}

function requireMemberType(...types) {
  return (req, res, next) => {
    if (!req.user) return requireMember(req, res, next);
    if (req.user.member_type === 'admin' || types.includes(req.user.member_type)) return next();
    return res.status(403).json({ message: '이용 권한이 없는 회원 유형입니다.' });
  };
}

// JSON 이 아닌 상태변경 요청을 차단해 단순 폼 기반 CSRF 를 막는다. (SameSite=Lax 쿠키와 함께 사용)
function requireJsonForMutations(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ message: 'Content-Type: application/json 요청만 허용됩니다.' });
  }
  return next();
}

module.exports = {
  parseCookies,
  cookieOptions,
  setSessionCookie,
  clearSessionCookie,
  attachUser,
  requireMember,
  requireMemberType,
  requireJsonForMutations
};
