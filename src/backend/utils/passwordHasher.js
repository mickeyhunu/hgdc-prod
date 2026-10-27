/**
 * 파일 역할: 비밀번호 해시 생성/검증 유틸리티 파일.
 */
const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);
const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1
};
const SALT_BYTES = 16;
const KEYLEN = 64;
const HASH_PREFIX = 'scrypt';

function isHashedPassword(value = '') {
  return String(value || '').startsWith(`${HASH_PREFIX}$`);
}

async function hashPassword(plainPassword = '') {
  const password = String(plainPassword || '');
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derivedKey = await scryptAsync(password, salt, KEYLEN, SCRYPT_PARAMS);
  return `${HASH_PREFIX}$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(plainPassword = '', storedPassword = '') {
  const password = String(plainPassword || '');
  const stored = String(storedPassword || '');

  if (!isHashedPassword(stored)) {
    return password === stored;
  }

  const [prefix, nValue, rValue, pValue, salt, keyHex] = stored.split('$');
  if (!prefix || !nValue || !rValue || !pValue || !salt || !keyHex) return false;

  const options = {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue)
  };

  const derivedKey = await scryptAsync(password, salt, keyHex.length / 2, options);
  const storedKey = Buffer.from(keyHex, 'hex');
  if (storedKey.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(storedKey, derivedKey);
}

module.exports = {
  hashPassword,
  verifyPassword,
  isHashedPassword
};
