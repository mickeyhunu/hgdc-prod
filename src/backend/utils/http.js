/**
 * 파일 역할: 응답/에러/입력 정리 공통 유틸리티.
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// async 컨트롤러의 예외를 Express 에러 핸들러로 넘긴다.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function text(value, { max = 255, required = false, label = '값' } = {}) {
  const normalized = String(value ?? '').trim();
  if (required && !normalized) throw new HttpError(400, `${label}을(를) 입력해주세요.`);
  if (normalized.length > max) throw new HttpError(400, `${label}은(는) ${max}자 이내로 입력해주세요.`);
  return normalized;
}

function int(value, { min = 0, max = Number.MAX_SAFE_INTEGER, nullable = true, label = '값' } = {}) {
  if (value === null || value === undefined || value === '') {
    if (nullable) return null;
    throw new HttpError(400, `${label}을(를) 입력해주세요.`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${label}이(가) 올바르지 않습니다.`);
  }
  return parsed;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function paging(query, defaultSize = 20) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const size = Math.min(50, Math.max(1, Number.parseInt(query.size, 10) || defaultSize));
  return { page, size, offset: (page - 1) * size };
}

module.exports = {
  HttpError,
  asyncHandler,
  text,
  int,
  oneOf,
  paging
};
