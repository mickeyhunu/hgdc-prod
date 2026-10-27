# 호구닷컴 (hgdc)

호빠 선수 구인구직 & 커뮤니티 사이트.
Node.js(Express) + MySQL + Vue 3(ESM, 빌드 없음) 구조이며, 본인확인은 NHN KCP V2 를 사용합니다.

## 핵심 정책
- **콘텐츠 열람은 19세 본인인증 회원만**: 비회원은 홈과 목록(제목·지역·급여 수준)까지만 볼 수 있습니다.
  상세 내용·연락처·글쓰기·댓글·추천·신고는 로그인이 필요하며, 비회원이 상세로 들어가면 `/login` 으로 보냅니다.
  공개 API: `/api/home`, `/api/jobs`, `/api/resumes`, `/api/community/posts` (목록), 그 외는 401.
- **가입 = KCP 휴대폰 본인인증 필수**: 서버가 KCP 결과를 직접 조회·복호화해서 나이를 판정합니다.
  클라이언트가 보낸 이름/생년월일은 쓰지 않습니다. 기준은 청소년보호법(만 19세가 되는 해 1월 1일부터 허용).
- **1인 1계정**: CI 는 SHA-256 해시(`users.ci_hash`)로만 저장하고 UNIQUE 로 중복가입을 막습니다.
- 검색엔진 색인 금지(`X-Robots-Tag`, `robots.txt`).

## 기능
| 구분 | 내용 |
| --- | --- |
| 구인 | 업소 회원이 선수 모집 공고 등록 (지역/급여형태/혜택 태그/연락처), 필터 검색, 6시간마다 끌어올리기, 마감 처리 |
| 구직 | 선수 회원 1인 1이력서 (키/몸무게/경력/희망지역/연락처), 공개·비공개, 끌어올리기. 나이는 본인인증 값으로 자동 표시 |
| 커뮤니티 | 자유/익명/질문/업소후기/정보 게시판, 주간 HOT, 댓글·대댓글, 추천, 익명 작성 |
| 공통 | 신고(공고/이력서/글/댓글), 마이페이지 |

## 실행
```bash
npm install
cp .env.example .env   # DB, JWT_SECRET, KCP 값 입력
npm run start          # http://localhost:8080
```

로컬에서 KCP 없이 가입 흐름을 테스트하려면 `.env.local` 에:
```
NODE_ENV=development
KCP_CERT_ENV=mock
HGDC_USE_LOCAL_DB=true
```
→ 본인인증 버튼이 개발용 가짜 인증창(`/kcp/mock`)을 엽니다. `NODE_ENV=production` 에서는 mock 이 강제로 꺼집니다.

## DB (AWS RDS MySQL)
- 접속정보는 `.env` 의 `HGDC_MYSQL_*` 로 주입합니다. RDS 는 `HGDC_MYSQL_SSL=true` 권장.
- 스키마: `src/backend/config/schema.sql`. `HGDC_DB_AUTO_MIGRATE=true`(기본)면 기동 시 `CREATE TABLE IF NOT EXISTS` 실행.
- 미리 DB 를 만들어 두세요: `CREATE DATABASE hgdc_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

## 구조
```text
server.js                       Express 진입점 (API, /kcp/callback, SPA 서빙)
src/backend
├── config     loadEnv, database(RDS 풀 + 마이그레이션), schema.sql
├── controllers authController(KCP·가입·로그인), jobController(구인·구직), communityController
├── middlewares authMiddleware (JWT 쿠키, 회원 유형 권한, JSON-only CSRF 방어)
├── routes     apiRoutes
└── utils      kcpIdentity, kcpCrypto, adultPolicy, jwt, passwordHasher, http
src/frontend
├── index.html
└── src        main.js(라우터·레이아웃), api.js, pages/, components/, styles/
```

## 다음 할 일 (초안 이후)
- 관리자 페이지(신고 처리, 회원 정지, 공고 숨김)
- 이미지 업로드(S3) — 이력서 프로필 사진, 업소 사진
- 1:1 쪽지 / 업소 ↔ 선수 지원하기 기능
- 유료 상단노출(프리미엄 공고) (토스페이먼츠 등)
- KCP 트랜잭션 캐시를 Redis/DB 로 이전 (서버 다중 인스턴스 대비)
- 이용약관/개인정보처리방침/청소년보호정책 페이지
