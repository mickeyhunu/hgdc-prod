/**
 * 파일 역할: HS256 JWT 발급/검증 유틸리티 (외부 의존성 없음).
 */
const crypto = require('crypto');

const DEFAULT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

function getSecret() {
  const secret = String(process.env.JWT_SECRET || '');
  if (secret.length < 32) {
    throw new Error('JWT_SECRET 환경변수는 32자 이상이어야 합니다.');
  }
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload, expiresInSeconds = Number(process.env.JWT_EXPIRES_IN_SECONDS) || DEFAULT_EXPIRES_IN_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }));
  const signature = crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

module.exports = {
  sign,
  verify
};
