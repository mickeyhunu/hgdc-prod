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

// CREATE TABLE IF NOT EXISTS 는 기존 테이블에 컬럼을 추가하지 않으므로, 이후 추가된 컬럼은 여기서 보정한다.
// backfill 은 해당 컬럼이 기존 컬럼(member_type 등)에서 값을 옮겨와야 할 때만 쓴다.
const ADDED_COLUMNS = [
  { table: 'users', column: 'email', definition: "VARCHAR(100) NOT NULL DEFAULT '' AFTER phone" },
  { table: 'users', column: 'marketing_agreed', definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER email' },
  { table: 'users', column: 'marketing_agreed_at', definition: 'DATETIME NULL AFTER marketing_agreed' },
  {
    table: 'users',
    column: 'is_admin',
    definition: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER nickname',
    backfill: "UPDATE users SET is_admin = 1 WHERE member_type = 'admin'"
  },
  {
    table: 'users',
    column: 'business_status',
    definition: "ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none' AFTER is_admin",
    backfill: "UPDATE users SET business_status = 'approved' WHERE member_type = 'business'"
  }
];

async function hasColumn(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function ensureColumns(connection) {
  for (const { table, column, definition, backfill } of ADDED_COLUMNS) {
    if (await hasColumn(connection, table, column)) continue;
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    if (backfill && await hasColumn(connection, 'users', 'member_type')) await connection.query(backfill);
  }
}

// 대상 DB 가 아직 없으면(최초 세팅) database 지정 없이 접속해서 먼저 만든다.
async function ensureDatabaseExists() {
  const { database, connectionLimit, ...serverConfig } = dbConfig;
  if (!/^[A-Za-z0-9_$]+$/.test(database)) throw new Error(`허용되지 않는 DB 이름입니다: ${database}`);

  const connection = await mysql.createConnection(serverConfig);
  try {
    const [rows] = await connection.query(
      'SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1',
      [database]
    );
    if (rows.length > 0) return false;
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    return true;
  } finally {
    await connection.end();
  }
}

async function initDatabase() {
  const autoMigrate = isEnabled(process.env.HGDC_DB_AUTO_MIGRATE ?? 'true');
  if (autoMigrate && await ensureDatabaseExists()) {
    console.log(`[DB] ${dbConfig.database} 데이터베이스가 없어 새로 생성했습니다.`);
  }

  const connection = await pool.getConnection();
  try {
    await connection.ping();
    if (autoMigrate) {
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      for (const statement of splitSqlStatements(schemaSql)) {
        await connection.query(statement);
      }
      await ensureColumns(connection);
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
