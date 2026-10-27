/**
 * 파일 역할: .env 파일 값을 읽어 process.env에 주입하는 간단한 환경 변수 로더 파일.
 */
const fs = require('fs');
const path = require('path');

function stripWrappingQuotes(value) {
  if (!value) return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(filePath = path.join(process.cwd(), '.env')) {
  let override = false;
  let targetPath = filePath;

  if (typeof filePath === 'object' && filePath !== null) {
    targetPath = filePath.filePath;
    override = Boolean(filePath.override);
  }

  if (!fs.existsSync(targetPath)) return false;

  const raw = fs.readFileSync(targetPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key) return;
    if (!override && Object.prototype.hasOwnProperty.call(process.env, key)) return;

    const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1));
    process.env[key] = value;
  });

  return true;
}

function loadDefaultEnvFiles() {
  let loadedLocalEnv = false;
  const candidates = [
    { filePath: path.join(process.cwd(), '.env') },
    { filePath: path.resolve(__dirname, '..', '.env') },
    { filePath: path.join(process.cwd(), '.env.local'), override: true },
    { filePath: path.resolve(__dirname, '..', '.env.local'), override: true }
  ];

  candidates.forEach((candidatePath) => {
    const loaded = loadEnvFile(candidatePath);
    const filePath = typeof candidatePath === 'object' && candidatePath !== null ? candidatePath.filePath : candidatePath;
    if (loaded && path.basename(filePath || '') === '.env.local') loadedLocalEnv = true;
  });

  if (loadedLocalEnv) process.env.HGDC_ENV_LOCAL_LOADED = 'true';
}

loadDefaultEnvFiles();

module.exports = {
  loadEnvFile,
  loadDefaultEnvFiles
};
