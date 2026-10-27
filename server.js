/**
 * 파일 역할: 호구닷컴 Express 서버 진입점. API, KCP 콜백, Vue SPA 정적 파일을 서빙한다.
 */
require('./src/backend/config/loadEnv');

const path = require('path');
const express = require('express');
const { initDatabase, dbConfig, useLocalDb } = require('./src/backend/config/database');
const apiRoutes = require('./src/backend/routes/apiRoutes');
const authController = require('./src/backend/controllers/authController');
const { attachUser, requireJsonForMutations } = require('./src/backend/middlewares/authMiddleware');
const { asyncHandler } = require('./src/backend/utils/http');
const jwt = require('./src/backend/utils/jwt');

const app = express();
const PORT = Number(process.env.PORT || 8090);
const FRONTEND_DIR = path.join(__dirname, 'src/frontend');

app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // 성인 전용 사이트: 검색엔진 색인 금지
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(attachUser);

// KCP 콜백/개발용 mock 인증창 (KCP 서버가 form POST 하므로 JSON 제한 밖에 둔다)
app.all('/kcp/callback', asyncHandler(authController.kcpCallback));
app.all('/kcp/mock', authController.kcpMockPage);
app.post('/kcp/mock/submit', authController.kcpMockSubmit);

app.use('/api', requireJsonForMutations, apiRoutes);
app.use('/api', (_req, res) => res.status(404).json({ message: 'API 를 찾을 수 없습니다.' }));

app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
// 빌드/파일명 해시가 없으므로 매 요청 ETag 재검증(변경 없으면 304)으로 배포 즉시 반영되게 한다.
app.use(express.static(FRONTEND_DIR, { index: false, maxAge: 0 }));
app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error('[ERROR]', req.method, req.originalUrl, error);
  res.status(status).json({ message: status >= 500 ? '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' : error.message });
});

async function start() {
  jwt.sign({ check: true }, 1); // JWT_SECRET 누락 시 기동 단계에서 바로 실패시킨다.
  await initDatabase();
  console.log(`[DB] ${useLocalDb ? 'LOCAL' : 'RDS'} ${dbConfig.host}:${dbConfig.port}/${dbConfig.database} 연결 완료`);
  app.listen(PORT, () => console.log(`[호구닷컴] http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error('[BOOT] 서버 기동 실패:', error.message);
  process.exit(1);
});
