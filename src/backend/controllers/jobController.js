/**
 * 파일 역할: 구인(업소 공고) / 구직(선수 이력서) API 컨트롤러.
 *
 * - 구인 공고 작성: business 회원
 * - 이력서 작성: player 회원 (1인 1이력서, upsert)
 * - 연락처(contact)는 로그인 회원에게만 내려간다. (모든 API 가 로그인 필요)
 */
const { pool } = require('../config/database');
const { displayAge } = require('../utils/adultPolicy');
const { HttpError, text, int, oneOf, paging } = require('../utils/http');

const REGIONS = ['강남', '서초', '송파', '홍대/신촌', '건대', '영등포', '서울기타', '인천', '경기', '부산', '대구', '대전', '광주', '울산', '기타'];
const PAY_TYPES = ['TC', 'DAILY', 'WEEKLY', 'MONTHLY', 'NEGOTIABLE'];
const BENEFITS = ['숙소제공', '픽업', '선불가능', '초보환영', '경력우대', '당일지급', '식사제공', '출퇴근자유'];
const BUMP_COOLDOWN_HOURS = 6;

function meta(_req, res) {
  res.json({ regions: REGIONS, payTypes: PAY_TYPES, benefits: BENEFITS, bumpCooldownHours: BUMP_COOLDOWN_HOURS });
}

function canEdit(user, ownerId) {
  return user.member_type === 'admin' || Number(user.id) === Number(ownerId);
}

function birthDateToDigits(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

// ───────────────────────── 구인 공고 ─────────────────────────

function readJobInput(body) {
  const benefits = (Array.isArray(body.benefits) ? body.benefits : [])
    .filter((benefit) => BENEFITS.includes(benefit));
  const payType = oneOf(body.payType, PAY_TYPES, null);
  if (!payType) throw new HttpError(400, '급여 형태를 선택해주세요.');

  return {
    title: text(body.title, { required: true, max: 100, label: '제목' }),
    store_name: text(body.storeName, { required: true, max: 50, label: '업소명' }),
    region: oneOf(body.region, REGIONS, null) || (() => { throw new HttpError(400, '지역을 선택해주세요.'); })(),
    pay_type: payType,
    pay_amount: payType === 'NEGOTIABLE' ? null : int(body.payAmount, { min: 0, max: 100000000, label: '급여' }),
    work_hours: text(body.workHours, { max: 50, label: '근무시간' }),
    benefits: benefits.join(','),
    contact: text(body.contact, { required: true, max: 100, label: '연락처' }),
    content: text(body.content, { required: true, max: 5000, label: '상세내용' })
  };
}

async function listJobs(req, res) {
  const { page, size, offset } = paging(req.query);
  const where = ["j.status = 'open'"];
  const params = [];

  if (REGIONS.includes(req.query.region)) {
    where.push('j.region = ?');
    params.push(req.query.region);
  }
  if (PAY_TYPES.includes(req.query.payType)) {
    where.push('j.pay_type = ?');
    params.push(req.query.payType);
  }
  if (BENEFITS.includes(req.query.benefit)) {
    where.push('FIND_IN_SET(?, j.benefits)');
    params.push(req.query.benefit);
  }
  const keyword = String(req.query.q || '').trim().slice(0, 30);
  if (keyword) {
    where.push('(j.title LIKE ? OR j.store_name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  const whereSql = where.join(' AND ');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM job_posts j WHERE ${whereSql}`, params);
  const [items] = await pool.query(
    `SELECT j.id, j.title, j.store_name, j.region, j.pay_type, j.pay_amount, j.work_hours, j.benefits,
            j.view_count, j.bumped_at, j.created_at, u.nickname
       FROM job_posts j JOIN users u ON u.id = j.user_id
      WHERE ${whereSql}
      ORDER BY j.bumped_at DESC, j.id DESC
      LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  res.json({ items, total, page, size });
}

async function getJob(req, res) {
  const id = int(req.params.id, { min: 1, nullable: false, label: '공고 번호' });
  const [rows] = await pool.query(
    `SELECT j.*, u.nickname FROM job_posts j JOIN users u ON u.id = j.user_id
      WHERE j.id = ? AND (j.status <> 'hidden' OR j.user_id = ? OR ? = 'admin') LIMIT 1`,
    [id, req.user.id, req.user.member_type]
  );
  if (!rows[0]) throw new HttpError(404, '공고를 찾을 수 없습니다.');
  await pool.query('UPDATE job_posts SET view_count = view_count + 1 WHERE id = ?', [id]);
  res.json({ ...rows[0], isMine: canEdit(req.user, rows[0].user_id) });
}

async function createJob(req, res) {
  const input = readJobInput(req.body);
  const [result] = await pool.query('INSERT INTO job_posts SET ?, user_id = ?', [input, req.user.id]);
  res.status(201).json({ id: result.insertId });
}

async function findOwnedJob(req) {
  const id = int(req.params.id, { min: 1, nullable: false, label: '공고 번호' });
  const [rows] = await pool.query('SELECT id, user_id, bumped_at FROM job_posts WHERE id = ? LIMIT 1', [id]);
  if (!rows[0]) throw new HttpError(404, '공고를 찾을 수 없습니다.');
  if (!canEdit(req.user, rows[0].user_id)) throw new HttpError(403, '본인 공고만 수정할 수 있습니다.');
  return rows[0];
}

async function updateJob(req, res) {
  const job = await findOwnedJob(req);
  const input = readJobInput(req.body);
  input.status = oneOf(req.body.status, ['open', 'closed'], 'open');
  await pool.query('UPDATE job_posts SET ? WHERE id = ?', [input, job.id]);
  res.json({ id: job.id });
}

async function deleteJob(req, res) {
  const job = await findOwnedJob(req);
  await pool.query("UPDATE job_posts SET status = 'hidden' WHERE id = ?", [job.id]);
  res.json({ ok: true });
}

async function bumpJob(req, res) {
  const job = await findOwnedJob(req);
  const [result] = await pool.query(
    `UPDATE job_posts SET bumped_at = UTC_TIMESTAMP()
      WHERE id = ? AND bumped_at <= UTC_TIMESTAMP() - INTERVAL ? HOUR`,
    [job.id, BUMP_COOLDOWN_HOURS]
  );
  if (!result.affectedRows) throw new HttpError(429, `끌어올리기는 ${BUMP_COOLDOWN_HOURS}시간마다 가능합니다.`);
  res.json({ ok: true });
}

async function myJobs(req, res) {
  const [items] = await pool.query(
    `SELECT id, title, region, status, view_count, bumped_at, created_at
       FROM job_posts WHERE user_id = ? AND status <> 'hidden' ORDER BY id DESC`,
    [req.user.id]
  );
  res.json({ items });
}

// ───────────────────────── 구직 이력서 ─────────────────────────

function readResumeInput(body) {
  const regions = (Array.isArray(body.regions) ? body.regions : []).filter((region) => REGIONS.includes(region));
  if (!regions.length) throw new HttpError(400, '희망 지역을 1개 이상 선택해주세요.');
  return {
    title: text(body.title, { required: true, max: 100, label: '제목' }),
    height_cm: int(body.heightCm, { min: 140, max: 220, label: '키' }),
    weight_kg: int(body.weightKg, { min: 40, max: 150, label: '몸무게' }),
    regions: regions.join(','),
    career_months: int(body.careerMonths, { min: 0, max: 600, nullable: false, label: '경력' }),
    available_time: text(body.availableTime, { max: 50, label: '가능 시간' }),
    contact: text(body.contact, { required: true, max: 100, label: '연락처' }),
    content: text(body.content, { required: true, max: 3000, label: '자기소개' }),
    is_public: body.isPublic === false ? 0 : 1
  };
}

function presentResume(row) {
  const { birth_date: birthDate, ...rest } = row;
  return { ...rest, age: displayAge(birthDateToDigits(birthDate)) };
}

async function listResumes(req, res) {
  const { page, size, offset } = paging(req.query);
  const where = ['r.is_public = 1', "u.status = 'active'"];
  const params = [];
  if (REGIONS.includes(req.query.region)) {
    where.push('FIND_IN_SET(?, r.regions)');
    params.push(req.query.region);
  }
  const whereSql = where.join(' AND ');
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM resumes r JOIN users u ON u.id = r.user_id WHERE ${whereSql}`, params
  );
  const [rows] = await pool.query(
    `SELECT r.id, r.title, r.height_cm, r.weight_kg, r.regions, r.career_months, r.available_time,
            r.view_count, r.bumped_at, u.nickname, u.birth_date
       FROM resumes r JOIN users u ON u.id = r.user_id
      WHERE ${whereSql}
      ORDER BY r.bumped_at DESC, r.id DESC
      LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  res.json({ items: rows.map(presentResume), total, page, size });
}

async function getResume(req, res) {
  const id = int(req.params.id, { min: 1, nullable: false, label: '이력서 번호' });
  const [rows] = await pool.query(
    `SELECT r.*, u.nickname, u.birth_date FROM resumes r JOIN users u ON u.id = r.user_id
      WHERE r.id = ? AND (r.is_public = 1 OR r.user_id = ? OR ? = 'admin') LIMIT 1`,
    [id, req.user.id, req.user.member_type]
  );
  if (!rows[0]) throw new HttpError(404, '이력서를 찾을 수 없습니다.');
  await pool.query('UPDATE resumes SET view_count = view_count + 1 WHERE id = ?', [id]);
  res.json({ ...presentResume(rows[0]), isMine: canEdit(req.user, rows[0].user_id) });
}

async function getMyResume(req, res) {
  const [rows] = await pool.query('SELECT * FROM resumes WHERE user_id = ? LIMIT 1', [req.user.id]);
  res.json({ resume: rows[0] || null });
}

async function upsertMyResume(req, res) {
  const input = readResumeInput(req.body);
  await pool.query(
    `INSERT INTO resumes SET ?, user_id = ?
     ON DUPLICATE KEY UPDATE title = VALUES(title), height_cm = VALUES(height_cm), weight_kg = VALUES(weight_kg),
       regions = VALUES(regions), career_months = VALUES(career_months), available_time = VALUES(available_time),
       contact = VALUES(contact), content = VALUES(content), is_public = VALUES(is_public)`,
    [input, req.user.id]
  );
  const [rows] = await pool.query('SELECT id FROM resumes WHERE user_id = ?', [req.user.id]);
  res.json({ id: rows[0].id });
}

async function bumpMyResume(req, res) {
  const [result] = await pool.query(
    `UPDATE resumes SET bumped_at = UTC_TIMESTAMP()
      WHERE user_id = ? AND bumped_at <= UTC_TIMESTAMP() - INTERVAL ? HOUR`,
    [req.user.id, BUMP_COOLDOWN_HOURS]
  );
  if (!result.affectedRows) throw new HttpError(429, `끌어올리기는 ${BUMP_COOLDOWN_HOURS}시간마다 가능합니다.`);
  res.json({ ok: true });
}

module.exports = {
  REGIONS,
  meta,
  listJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  bumpJob,
  myJobs,
  listResumes,
  getResume,
  getMyResume,
  upsertMyResume,
  bumpMyResume
};
