/**
 * 파일 역할: NHN KCP 본인확인 V2 거래등록/결과조회 서비스.
 *
 * 흐름
 *  1) registerTransaction  : KCP 거래등록 → reg_cert_key, call_url 발급 (브라우저는 call_url 로 팝업 POST)
 *  2) KCP → /kcp/callback   : 인증 완료 콜백 → fetchVerifiedIdentity 로 결과조회/복호화 후 캐시에 저장
 *  3) 회원가입 API          : 캐시의 검증 결과만 신뢰한다. (클라이언트가 보낸 이름/생년월일은 절대 사용하지 않음)
 *
 * KCP_CERT_ENV=mock 이고 NODE_ENV!=production 이면 KCP 대신 로컬 가짜 인증창(/kcp/mock)을 사용한다.
 */
const crypto = require('crypto');
const { encryptJson, decryptJson } = require('./kcpCrypto');

const TRANSACTION_TTL_MS = 10 * 60 * 1000;
const transactions = new Map();

function getCertEnvironment() {
  const configured = String(process.env.KCP_CERT_ENV || '').trim().toLowerCase();
  if (configured === 'mock' && process.env.NODE_ENV !== 'production') return 'mock';
  if (['test', 'sandbox', 'development', 'dev', 'local'].includes(configured)) return 'test';
  return 'production';
}

function getCertHost() {
  return getCertEnvironment() === 'test' ? 'https://testcert.kcp.co.kr' : 'https://cert.kcp.co.kr';
}

function getConfig() {
  return {
    siteCode: String(process.env.KCP_SITE_CODE || '').trim(),
    encKey: String(process.env.KCP_ENC_KEY || '').trim()
  };
}

function resolveReturnUrl(req) {
  const configured = String(process.env.KCP_RETURN_URL || '').trim();
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}/kcp/callback`;
}

function validateReturnUrl(returnUrl) {
  if (getCertEnvironment() !== 'production') return null;
  try {
    const parsed = new URL(returnUrl);
    if (parsed.protocol !== 'https:') return '운영 KCP 본인확인은 KCP_RETURN_URL에 공개 HTTPS URL이 필요합니다.';
    if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(parsed.hostname)) {
      return '운영 KCP 본인확인은 localhost 콜백 URL을 사용할 수 없습니다.';
    }
    return null;
  } catch (_error) {
    return 'KCP_RETURN_URL은 KCP가 접근 가능한 공개 HTTPS URL이어야 합니다.';
  }
}

function cleanup(now = Date.now()) {
  for (const [key, value] of transactions.entries()) {
    if (now - value.createdAt > TRANSACTION_TTL_MS) transactions.delete(key);
  }
}

function getTransaction(regCertKey) {
  cleanup();
  return transactions.get(String(regCertKey || '').trim()) || null;
}

function consumeTransaction(regCertKey) {
  const transaction = getTransaction(regCertKey);
  transactions.delete(String(regCertKey || '').trim());
  return transaction;
}

function upstreamError(message, status = 502, detail = '') {
  const error = new Error(message);
  error.status = status;
  error.detail = detail;
  return error;
}

async function postKcp(url, { headers = {}, rawBody }) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', ...headers },
      body: rawBody
    });
  } catch (error) {
    throw upstreamError('KCP 본인확인 서버와 통신하지 못했습니다.', 502, error.message);
  }

  const bodyText = (await response.text()).trim();
  let payload = null;
  try {
    payload = JSON.parse(bodyText);
  } catch (_error) {
    const params = new URLSearchParams(bodyText);
    payload = Object.fromEntries(params.entries());
  }

  if (!response.ok || !payload || Object.keys(payload).length === 0) {
    throw upstreamError(payload?.res_msg || 'KCP 본인확인 요청이 실패했습니다.', 502, `status=${response.status}`);
  }
  const resultCode = String(payload.res_cd || payload.result_cd || '').trim();
  if (resultCode && resultCode !== '0000') {
    throw upstreamError(payload.res_msg || payload.result_msg || 'KCP 본인확인 요청이 실패했습니다.');
  }
  return payload;
}

function pick(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function normalizeIdentity(decrypted) {
  const ciUrl = pick(decrypted, ['CI_URL', 'ci_url']);
  const sexCode = pick(decrypted, ['sex_code', 'sex', 'gender']);
  return {
    name: pick(decrypted, ['user_name', 'name']),
    birthDate: pick(decrypted, ['birth_day', 'birthDate', 'birthday', 'birth']),
    phone: pick(decrypted, ['phone_no', 'phone', 'cellno']),
    gender: ['01', '1', 'M', 'm'].includes(sexCode) ? 'M' : (['02', '2', 'F', 'f'].includes(sexCode) ? 'F' : ''),
    ci: ciUrl ? safeDecode(ciUrl) : pick(decrypted, ['CI', 'ci'])
  };
}

/**
 * 거래등록. browserNonce 는 httpOnly 쿠키로 내려가며, 결과조회/가입 시 같은 브라우저인지 확인하는 데 쓴다.
 */
async function registerTransaction(req) {
  const environment = getCertEnvironment();
  const orderNo = `HGDC_${Date.now()}_${crypto.randomInt(100000)}`;
  const browserNonce = crypto.randomBytes(24).toString('hex');

  if (environment === 'mock') {
    const regCertKey = `MOCK_${crypto.randomBytes(16).toString('hex')}`;
    transactions.set(regCertKey, { orderNo, browserNonce, createdAt: Date.now() });
    return { regCertKey, callUrl: '/kcp/mock', browserNonce, environment };
  }

  const config = getConfig();
  if (!config.siteCode || !config.encKey) {
    throw upstreamError('KCP 연동 환경변수(KCP_SITE_CODE, KCP_ENC_KEY)가 설정되지 않았습니다.', 500);
  }

  const returnUrl = resolveReturnUrl(req);
  const returnUrlError = validateReturnUrl(returnUrl);
  if (returnUrlError) throw upstreamError(returnUrlError, 500);

  const encrypted = encryptJson({
    site_cd: config.siteCode,
    ordr_idxx: orderNo,
    Ret_URL: returnUrl,
    cert_method: '01',
    web_siteid: String(process.env.KCP_WEB_SITE_ID || '').trim(),
    param_opt_1: orderNo,
    param_opt_2: '',
    param_opt_3: ''
  }, config.encKey, config.siteCode);

  const result = await postKcp(`${getCertHost()}/api/reg/certDataReg.do`, {
    headers: { site_cd: config.siteCode, rv: encrypted.rv },
    rawBody: encrypted.enc_data
  });

  const regCertKey = String(result.reg_cert_key || '').trim();
  const callUrl = String(result.call_url || result.cert_url || result.auth_url || '').trim();
  if (!regCertKey || !callUrl) throw upstreamError('KCP 본인확인 거래등록 응답에 인증창 호출 정보가 없습니다.');

  cleanup();
  transactions.set(regCertKey, { orderNo, browserNonce, createdAt: Date.now() });
  return { regCertKey, callUrl, browserNonce, environment };
}

/** KCP 콜백에서 호출: 결과조회 → 복호화 → 캐시에 identity 저장 */
async function fetchVerifiedIdentity(regCertKey, orderNoHint = '') {
  const transaction = getTransaction(regCertKey);
  if (!transaction) throw upstreamError('본인인증 요청이 만료되었습니다. 다시 시도해주세요.', 400);
  if (transaction.identity) return transaction.identity;

  const config = getConfig();
  const result = await postKcp(`${getCertHost()}/api/query/getCertData.do`, {
    headers: { site_cd: config.siteCode },
    rawBody: JSON.stringify({ reg_cert_key: regCertKey, ordr_idxx: transaction.orderNo || orderNoHint })
  });

  const encCertData = String(result.enc_cert_data || result.enc_data || '').trim();
  const rv = String(result.rv || '').trim();
  if (!encCertData || !rv) throw upstreamError('KCP 본인확인 결과 조회 응답에 복호화 데이터가 없습니다.');

  const identity = normalizeIdentity(decryptJson(encCertData, rv, config.encKey, config.siteCode));
  if (!identity.ci || !identity.birthDate || !identity.name) {
    throw upstreamError('본인인증 결과에 필수 정보(CI/이름/생년월일)가 없습니다.');
  }
  transaction.identity = identity;
  return identity;
}

/** mock 인증창에서 입력한 값을 identity 로 저장 (로컬 개발 전용) */
function saveMockIdentity(regCertKey, { name, birthDate }) {
  if (getCertEnvironment() !== 'mock') throw upstreamError('mock 본인인증이 비활성화되어 있습니다.', 403);
  const transaction = getTransaction(regCertKey);
  if (!transaction) throw upstreamError('본인인증 요청이 만료되었습니다.', 400);
  transaction.identity = {
    name: String(name || '').trim() || '홍길동',
    birthDate: String(birthDate || '').replace(/\D/g, ''),
    phone: '01000000000',
    gender: 'M',
    ci: `MOCK_CI_${crypto.randomBytes(16).toString('hex')}`
  };
  return transaction.identity;
}

function hashCi(ci) {
  return crypto.createHash('sha256').update(`hgdc:${ci}`).digest('hex');
}

module.exports = {
  getCertEnvironment,
  registerTransaction,
  fetchVerifiedIdentity,
  saveMockIdentity,
  getTransaction,
  consumeTransaction,
  hashCi
};
