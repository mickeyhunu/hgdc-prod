/**
 * 파일 역할: 청소년보호법 기준 성인(19세) 판정 유틸리티.
 *
 * 청소년보호법상 "청소년"은 만 19세 미만이되, 만 19세가 되는 해의 1월 1일을 맞이한 사람은 제외한다.
 * 따라서 (올해 연도 - 출생 연도) >= 19 이면 이용 가능으로 본다. 기준 시각은 한국시간(KST).
 */
const ADULT_AGE = 19;

function parseBirthDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return { year, month, day, iso: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` };
}

function currentKstYear(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCFullYear();
}

function isAdult(birthDate, now = new Date()) {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return false;
  return currentKstYear(now) - parsed.year >= ADULT_AGE;
}

// 화면 표기용 만 나이
function displayAge(birthDate, now = new Date()) {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hadBirthday = kst.getUTCMonth() + 1 > parsed.month
    || (kst.getUTCMonth() + 1 === parsed.month && kst.getUTCDate() >= parsed.day);
  return kst.getUTCFullYear() - parsed.year - (hadBirthday ? 0 : 1);
}

module.exports = {
  ADULT_AGE,
  parseBirthDate,
  isAdult,
  displayAge
};
