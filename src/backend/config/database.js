/**
 * 파일 역할: AWS RDS(MySQL) 커넥션 풀 생성과 스키마 자동 적용을 담당하는 구성 파일.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

const useLocalDb = isEnabled(process.env.HGDC_USE_LOCAL_DB);

function readDbValue(localKey, remoteKey, fallback) {
  const keys = useLocalDb ? [localKey, remoteKey] : [remoteKey];
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && String(value).trim() !== '') return value;
  }
  return fallback;
}

const dbConfig = {
  host: readDbValue('HGDC_LOCAL_MYSQL_HOST', 'HGDC_MYSQL_HOST', '127.0.0.1'),
  port: Number(readDbValue('HGDC_LOCAL_MYSQL_PORT', 'HGDC_MYSQL_PORT', 3306)),
  user: readDbValue('HGDC_LOCAL_MYSQL_USER', 'HGDC_MYSQL_USER', 'root'),
  password: readDbValue('HGDC_LOCAL_MYSQL_PASSWORD', 'HGDC_MYSQL_PASSWORD', ''),
  database: readDbValue('HGDC_LOCAL_MYSQL_DATABASE', 'HGDC_MYSQL_DATABASE', useLocalDb ? 'hgdc_DB_local' : 'hgdc_DB'),
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: 'Z',
  dateStrings: false,
  multipleStatements: false,
  // RDS 는 SSL 연결을 권장. 로컬 DB 에서는 끈다.
  ssl: !useLocalDb && isEnabled(process.env.HGDC_MYSQL_SSL) ? { rejectUnauthorized: true } : undefined
};

const pool = mysql.createPool(dbConfig);

function splitSqlStatements(sql) {
  // schema.sql 은 문자열 리터럴 안에 '--' 나 ';' 를 쓰지 않는다는 전제의 단순 분리기.
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function initDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    if (isEnabled(process.env.HGDC_DB_AUTO_MIGRATE ?? 'true')) {
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      for (const statement of splitSqlStatements(schemaSql)) {
        await connection.query(statement);
      }
    }
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  dbConfig,
  useLocalDb,
  initDatabase
};
