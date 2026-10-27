/**
 * 파일 역할: 커뮤니티(게시판/댓글/추천/신고) API 컨트롤러.
 *
 * 익명 게시판(anon)은 항상 익명이며, 응답에서 작성자 닉네임을 제거한다. (DB 에는 user_id 를 남겨 신고 처리에 사용)
 */
const { pool } = require('../config/database');
const { HttpError, text, int, oneOf, paging } = require('../utils/http');

const BOARDS = [
  { key: 'free', name: '자유게시판' },
  { key: 'anon', name: '익명게시판' },
  { key: 'qna', name: '질문/답변' },
  { key: 'review', name: '업소후기' },
  { key: 'info', name: '정보공유' }
];
const BOARD_KEYS = BOARDS.map((board) => board.key);
const ANON_LABEL = '익명';

function boards(_req, res) {
  res.json({ boards: BOARDS });
}

// viewer 가 null 이면 비회원(목록 조회)
function presentAuthor(row, viewer) {
  const { user_id: userId, nickname, is_anonymous: isAnonymous, ...rest } = row;
  const isMine = Boolean(viewer) && Number(userId) === Number(viewer.id);
  return {
    ...rest,
    author: isAnonymous ? ANON_LABEL : nickname,
    isMine,
    canManage: isMine || viewer?.member_type === 'admin'
  };
}

async function listPosts(req, res) {
  const { page, size, offset } = paging(req.query);
  const where = ["p.status = 'visible'"];
  const params = [];

  if (req.query.board === 'hot') {
    where.push('p.like_count >= 5', 'p.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY');
  } else if (BOARD_KEYS.includes(req.query.board)) {
    where.push('p.board = ?');
    params.push(req.query.board);
  }
  const keyword = String(req.query.q || '').trim().slice(0, 30);
  if (keyword) {
    where.push('(p.title LIKE ? OR p.content LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  const whereSql = where.join(' AND ');
  const orderSql = req.query.board === 'hot' ? 'p.like_count DESC, p.id DESC' : 'p.id DESC';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM community_posts p WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT p.id, p.board, p.title, p.user_id, p.is_anonymous, p.view_count, p.like_count, p.comment_count,
            p.created_at, u.nickname
       FROM community_posts p JOIN users u ON u.id = p.user_id
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  res.json({ items: rows.map((row) => presentAuthor(row, req.user)), total, page, size });
}

async function getPost(req, res) {
  const id = int(req.params.id, { min: 1, nullable: false, label: '게시글 번호' });
  const [rows] = await pool.query(
    `SELECT p.*, u.nickname,
            EXISTS(SELECT 1 FROM community_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
       FROM community_posts p JOIN users u ON u.id = p.user_id
      WHERE p.id = ? AND p.status = 'visible' LIMIT 1`,
    [req.user.id, id]
  );
  if (!rows[0]) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  await pool.query('UPDATE community_posts SET view_count = view_count + 1 WHERE id = ?', [id]);

  const [comments] = await pool.query(
    `SELECT c.id, c.parent_id, c.content, c.user_id, c.is_anonymous, c.status, c.created_at, u.nickname
       FROM community_comments c JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ? ORDER BY COALESCE(c.parent_id, c.id), c.id`,
    [id]
  );

  res.json({
    ...presentAuthor(rows[0], req.user),
    liked: Boolean(rows[0].liked),
    comments: comments.map((comment) => (comment.status === 'deleted'
      ? { id: comment.id, parent_id: comment.parent_id, deleted: true, content: '삭제된 댓글입니다.', author: '', created_at: comment.created_at }
      : presentAuthor(comment, req.user)))
  });
}

function readPostInput(body) {
  const board = oneOf(body.board, BOARD_KEYS, null);
  if (!board) throw new HttpError(400, '게시판을 선택해주세요.');
  return {
    board,
    title: text(body.title, { required: true, max: 100, label: '제목' }),
    content: text(body.content, { required: true, max: 10000, label: '내용' }),
    is_anonymous: board === 'anon' || body.isAnonymous === true ? 1 : 0
  };
}

async function findManageablePost(req) {
  const id = int(req.params.id, { min: 1, nullable: false, label: '게시글 번호' });
  const [rows] = await pool.query("SELECT id, user_id FROM community_posts WHERE id = ? AND status = 'visible'", [id]);
  if (!rows[0]) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  if (Number(rows[0].user_id) !== Number(req.user.id) && req.user.member_type !== 'admin') {
    throw new HttpError(403, '본인 글만 수정/삭제할 수 있습니다.');
  }
  return rows[0];
}

async function createPost(req, res) {
  const input = readPostInput(req.body);
  const [result] = await pool.query('INSERT INTO community_posts SET ?, user_id = ?', [input, req.user.id]);
  res.status(201).json({ id: result.insertId });
}

async function updatePost(req, res) {
  const post = await findManageablePost(req);
  const input = readPostInput(req.body);
  await pool.query('UPDATE community_posts SET ? WHERE id = ?', [input, post.id]);
  res.json({ id: post.id });
}

async function deletePost(req, res) {
  const post = await findManageablePost(req);
  await pool.query("UPDATE community_posts SET status = 'deleted' WHERE id = ?", [post.id]);
  res.json({ ok: true });
}

async function toggleLike(req, res) {
  const id = int(req.params.id, { min: 1, nullable: false, label: '게시글 번호' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [posts] = await connection.query(
      "SELECT id FROM community_posts WHERE id = ? AND status = 'visible' FOR UPDATE", [id]
    );
    if (!posts[0]) throw new HttpError(404, '게시글을 찾을 수 없습니다.');

    const [deleted] = await connection.query('DELETE FROM community_likes WHERE post_id = ? AND user_id = ?', [id, req.user.id]);
    const liked = deleted.affectedRows === 0;
    if (liked) await connection.query('INSERT INTO community_likes (post_id, user_id) VALUES (?, ?)', [id, req.user.id]);
    await connection.query(
      'UPDATE community_posts SET like_count = (SELECT COUNT(*) FROM community_likes WHERE post_id = ?) WHERE id = ?',
      [id, id]
    );
    const [[{ like_count: likeCount }]] = await connection.query('SELECT like_count FROM community_posts WHERE id = ?', [id]);
    await connection.commit();
    res.json({ liked, likeCount });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createComment(req, res) {
  const postId = int(req.params.id, { min: 1, nullable: false, label: '게시글 번호' });
  const content = text(req.body.content, { required: true, max: 1000, label: '댓글' });
  const parentId = int(req.body.parentId, { min: 1, label: '부모 댓글' });

  const [posts] = await pool.query("SELECT board FROM community_posts WHERE id = ? AND status = 'visible'", [postId]);
  if (!posts[0]) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  if (parentId) {
    const [parents] = await pool.query(
      'SELECT id FROM community_comments WHERE id = ? AND post_id = ? AND parent_id IS NULL', [parentId, postId]
    );
    if (!parents[0]) throw new HttpError(400, '답글을 달 수 없는 댓글입니다.');
  }

  const isAnonymous = posts[0].board === 'anon' || req.body.isAnonymous === true ? 1 : 0;
  const [result] = await pool.query(
    'INSERT INTO community_comments (post_id, user_id, parent_id, content, is_anonymous) VALUES (?, ?, ?, ?, ?)',
    [postId, req.user.id, parentId, content, isAnonymous]
  );
  await pool.query('UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = ?', [postId]);
  res.status(201).json({ id: result.insertId });
}

async function deleteComment(req, res) {
  const commentId = int(req.params.commentId, { min: 1, nullable: false, label: '댓글 번호' });
  const [rows] = await pool.query(
    "SELECT id, post_id, user_id FROM community_comments WHERE id = ? AND status = 'visible'", [commentId]
  );
  const comment = rows[0];
  if (!comment) throw new HttpError(404, '댓글을 찾을 수 없습니다.');
  if (Number(comment.user_id) !== Number(req.user.id) && req.user.member_type !== 'admin') {
    throw new HttpError(403, '본인 댓글만 삭제할 수 있습니다.');
  }
  await pool.query("UPDATE community_comments SET status = 'deleted' WHERE id = ?", [commentId]);
  await pool.query('UPDATE community_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?', [comment.post_id]);
  res.json({ ok: true });
}

async function createReport(req, res) {
  const targetType = oneOf(req.body.targetType, ['job', 'resume', 'post', 'comment'], null);
  if (!targetType) throw new HttpError(400, '신고 대상이 올바르지 않습니다.');
  const targetId = int(req.body.targetId, { min: 1, nullable: false, label: '신고 대상' });
  const reason = text(req.body.reason, { required: true, max: 255, label: '신고 사유' });
  try {
    await pool.query(
      'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)',
      [req.user.id, targetType, targetId, reason]
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, '이미 신고한 대상입니다.');
    throw error;
  }
  res.status(201).json({ ok: true });
}

async function home(req, res) {
  const [jobs] = await pool.query(
    `SELECT id, title, store_name, region, pay_type, pay_amount, bumped_at FROM job_posts
      WHERE status = 'open' ORDER BY bumped_at DESC LIMIT 8`
  );
  const [resumes] = await pool.query(
    `SELECT r.id, r.title, r.regions, r.career_months, u.nickname FROM resumes r JOIN users u ON u.id = r.user_id
      WHERE r.is_public = 1 AND u.status = 'active' ORDER BY r.bumped_at DESC LIMIT 8`
  );
  const [posts] = await pool.query(
    `SELECT p.id, p.board, p.title, p.comment_count, p.like_count, p.created_at FROM community_posts p
      WHERE p.status = 'visible' ORDER BY p.id DESC LIMIT 10`
  );
  const [hot] = await pool.query(
    `SELECT p.id, p.board, p.title, p.comment_count, p.like_count FROM community_posts p
      WHERE p.status = 'visible' AND p.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
      ORDER BY p.like_count DESC, p.id DESC LIMIT 5`
  );
  res.json({ jobs, resumes, posts, hot });
}

module.exports = {
  boards,
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  toggleLike,
  createComment,
  deleteComment,
  createReport,
  home
};
