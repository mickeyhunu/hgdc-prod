/**
 * 파일 역할: /api 하위 라우트 정의.
 *
 * 접근 정책
 *  - 비회원: 홈 요약과 목록(제목 수준)만 조회 가능
 *  - 19세 본인인증 회원: 상세 내용·연락처 열람, 글쓰기, 댓글, 추천, 신고
 */
const express = require('express');
const auth = require('../controllers/authController');
const jobs = require('../controllers/jobController');
const community = require('../controllers/communityController');
const { requireMember, requireMemberType } = require('../middlewares/authMiddleware');
const { asyncHandler: h } = require('../utils/http');

const router = express.Router();

// ── 인증 ──
router.post('/auth/identity', h(auth.requestIdentity));
router.get('/auth/identity/:regCertKey', h(auth.getIdentityResult));
router.post('/auth/signup', h(auth.signup));
router.post('/auth/login', h(auth.login));
router.post('/auth/logout', auth.logout);
router.get('/auth/me', auth.me);

// ── 비회원 공개: 목록/요약 ──
router.get('/home', h(community.home));
router.get('/jobs/meta', jobs.meta);
router.get('/jobs', h(jobs.listJobs));
router.get('/resumes', h(jobs.listResumes));
router.get('/community/boards', community.boards);
router.get('/community/posts', h(community.listPosts));

// ── 이하 19세 본인인증 회원 전용 ──
router.use(requireMember);

// 구인 (업소 공고)
router.get('/jobs/mine', requireMemberType('business'), h(jobs.myJobs));
router.get('/jobs/:id', h(jobs.getJob));
router.post('/jobs', requireMemberType('business'), h(jobs.createJob));
router.put('/jobs/:id', requireMemberType('business'), h(jobs.updateJob));
router.delete('/jobs/:id', requireMemberType('business'), h(jobs.deleteJob));
router.post('/jobs/:id/bump', requireMemberType('business'), h(jobs.bumpJob));

// 구직 (선수 이력서)
router.get('/resumes/mine', requireMemberType('player'), h(jobs.getMyResume));
router.put('/resumes/mine', requireMemberType('player'), h(jobs.upsertMyResume));
router.post('/resumes/mine/bump', requireMemberType('player'), h(jobs.bumpMyResume));
router.get('/resumes/:id', h(jobs.getResume));

// 커뮤니티
router.get('/community/posts/:id', h(community.getPost));
router.post('/community/posts', h(community.createPost));
router.put('/community/posts/:id', h(community.updatePost));
router.delete('/community/posts/:id', h(community.deletePost));
router.post('/community/posts/:id/like', h(community.toggleLike));
router.post('/community/posts/:id/comments', h(community.createComment));
router.delete('/community/comments/:commentId', h(community.deleteComment));

router.post('/reports', h(community.createReport));

module.exports = router;
