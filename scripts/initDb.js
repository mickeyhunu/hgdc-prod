/**
 * 파일 역할: DB 초기 세팅 스크립트. 데이터베이스가 없으면 생성하고 schema.sql 테이블을 적용한다.
 * 사용: npm run db:init  (서버를 띄우지 않고 DB 만 준비할 때)
 */
require('../src/backend/config/loadEnv');

process.env.HGDC_DB_AUTO_MIGRATE = 'true';
const { initDatabase, pool, dbConfig, useLocalDb } = require('../src/backend/config/database');

initDatabase()
  .then(() => {
    console.log(`[DB] ${useLocalDb ? 'LOCAL' : 'RDS'} ${dbConfig.host}:${dbConfig.port}/${dbConfig.database} 초기 세팅 완료`);
  })
  .catch((error) => {
    console.error('[DB] 초기 세팅 실패:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
