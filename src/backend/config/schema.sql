-- 파일 역할: 호구닷컴 MySQL 스키마. 서버 기동 시 HGDC_DB_AUTO_MIGRATE=true 면 자동 실행된다.
-- 모든 테이블은 utf8mb4, 시간은 UTC(DATETIME) 로 저장한다.

CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  login_id        VARCHAR(30)  NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  nickname        VARCHAR(20)  NOT NULL,
  member_type     ENUM('player','business','admin') NOT NULL DEFAULT 'player',
  -- 본인인증 결과 (CI 원문은 저장하지 않고 SHA-256 해시만 저장해 중복가입 방지에 사용)
  ci_hash         CHAR(64)     NOT NULL,
  real_name       VARCHAR(50)  NOT NULL,
  birth_date      DATE         NOT NULL,
  gender          ENUM('M','F','') NOT NULL DEFAULT '',
  phone           VARCHAR(20)  NOT NULL DEFAULT '',
  verified_at     DATETIME     NOT NULL,
  status          ENUM('active','suspended','withdrawn') NOT NULL DEFAULT 'active',
  last_login_at   DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_users_login_id (login_id),
  UNIQUE KEY uk_users_nickname (nickname),
  UNIQUE KEY uk_users_ci_hash (ci_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 구인: 업소(business 회원)가 선수를 모집하는 공고
CREATE TABLE IF NOT EXISTS job_posts (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  title           VARCHAR(100) NOT NULL,
  store_name      VARCHAR(50)  NOT NULL,
  region          VARCHAR(30)  NOT NULL,
  pay_type        ENUM('TC','DAILY','WEEKLY','MONTHLY','NEGOTIABLE') NOT NULL DEFAULT 'TC',
  pay_amount      INT UNSIGNED NULL,
  work_hours      VARCHAR(50)  NOT NULL DEFAULT '',
  benefits        VARCHAR(255) NOT NULL DEFAULT '',   -- 콤마 구분 태그: 숙소제공,픽업,선불가능 ...
  contact         VARCHAR(100) NOT NULL DEFAULT '',   -- 카톡/텔레그램 ID 등
  content         TEXT         NOT NULL,
  status          ENUM('open','closed','hidden') NOT NULL DEFAULT 'open',
  view_count      INT UNSIGNED NOT NULL DEFAULT 0,
  bumped_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 끌어올리기 정렬 기준
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_job_posts_list (status, bumped_at),
  KEY idx_job_posts_region (region, status, bumped_at),
  KEY idx_job_posts_user (user_id),
  CONSTRAINT fk_job_posts_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 구직: 선수(player 회원)의 이력서. 1인 1이력서.
CREATE TABLE IF NOT EXISTS resumes (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  title           VARCHAR(100) NOT NULL,
  height_cm       SMALLINT UNSIGNED NULL,
  weight_kg       SMALLINT UNSIGNED NULL,
  regions         VARCHAR(255) NOT NULL DEFAULT '',   -- 희망지역 콤마 구분
  career_months   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  available_time  VARCHAR(50)  NOT NULL DEFAULT '',
  contact         VARCHAR(100) NOT NULL DEFAULT '',
  content         TEXT         NOT NULL,
  is_public       TINYINT(1)   NOT NULL DEFAULT 1,
  view_count      INT UNSIGNED NOT NULL DEFAULT 0,
  bumped_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_resumes_user (user_id),
  KEY idx_resumes_list (is_public, bumped_at),
  CONSTRAINT fk_resumes_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 커뮤니티
CREATE TABLE IF NOT EXISTS community_posts (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  board           ENUM('free','anon','qna','review','info') NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  title           VARCHAR(100) NOT NULL,
  content         TEXT         NOT NULL,
  is_anonymous    TINYINT(1)   NOT NULL DEFAULT 0,
  view_count      INT UNSIGNED NOT NULL DEFAULT 0,
  like_count      INT UNSIGNED NOT NULL DEFAULT 0,
  comment_count   INT UNSIGNED NOT NULL DEFAULT 0,
  status          ENUM('visible','hidden','deleted') NOT NULL DEFAULT 'visible',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_community_posts_board (board, status, id),
  KEY idx_community_posts_hot (status, like_count, id),
  KEY idx_community_posts_user (user_id),
  CONSTRAINT fk_community_posts_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_comments (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id         BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  parent_id       BIGINT UNSIGNED NULL,
  content         VARCHAR(1000) NOT NULL,
  is_anonymous    TINYINT(1)   NOT NULL DEFAULT 0,
  status          ENUM('visible','deleted') NOT NULL DEFAULT 'visible',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_community_comments_post (post_id, id),
  CONSTRAINT fk_community_comments_post FOREIGN KEY (post_id) REFERENCES community_posts(id),
  CONSTRAINT fk_community_comments_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_likes (
  post_id         BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_community_likes_post FOREIGN KEY (post_id) REFERENCES community_posts(id),
  CONSTRAINT fk_community_likes_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 신고 (구인공고/이력서/게시글/댓글 공통)
CREATE TABLE IF NOT EXISTS reports (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_id     BIGINT UNSIGNED NOT NULL,
  target_type     ENUM('job','resume','post','comment') NOT NULL,
  target_id       BIGINT UNSIGNED NOT NULL,
  reason          VARCHAR(255) NOT NULL,
  status          ENUM('pending','resolved','rejected') NOT NULL DEFAULT 'pending',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_reports_once (reporter_id, target_type, target_id),
  KEY idx_reports_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
