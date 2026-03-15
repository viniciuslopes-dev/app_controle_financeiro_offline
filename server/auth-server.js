import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.AUTH_DB_PATH || path.join(__dirname, 'auth.db');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS || 60 * 15);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'finance_refresh_token';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const LOGIN_RATE_WINDOW_SECONDS = Number(process.env.LOGIN_RATE_WINDOW_SECONDS || 60 * 15);
const LOGIN_RATE_MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_MAX_ATTEMPTS || 10);
const LOGIN_LOCK_BASE_SECONDS = Number(process.env.LOGIN_LOCK_BASE_SECONDS || 5);
const LOGIN_LOCK_MAX_SECONDS = Number(process.env.LOGIN_LOCK_MAX_SECONDS || 60 * 15);
const REQUIRE_HTTPS = String(process.env.REQUIRE_HTTPS || 'true').toLowerCase() !== 'false';
const ALLOW_INSECURE_LOCALHOST = String(process.env.ALLOW_INSECURE_LOCALHOST || 'true').toLowerCase() !== 'false';
const PORT = Number(process.env.PORT || 3000);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    lock_until TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_backups (
    user_id INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT,
    replaced_by_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(replaced_by_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, expires_at);
  CREATE TABLE IF NOT EXISTS auth_rate_limits (
    fingerprint TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL,
    blocked_until TEXT
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    identifier TEXT,
    event_type TEXT NOT NULL,
    success INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS sync_transactions (
    user_id INTEGER NOT NULL,
    id TEXT NOT NULL,
    data TEXT,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    changed_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    etag TEXT NOT NULL,
    device_id TEXT,
    PRIMARY KEY (user_id, id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_sync_transactions_user_changed
    ON sync_transactions(user_id, changed_at);
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

ensureColumn('users', 'failed_login_attempts', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'lock_until', 'TEXT');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function nowIsoString() {
  return new Date().toISOString();
}

function parseIsoDate(value) {
  const stamp = new Date(value).getTime();
  if (Number.isNaN(stamp)) return null;
  return new Date(stamp);
}

function sanitizeIsoDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const parsed = parseIsoDate(text);
  return parsed ? parsed.toISOString() : null;
}

function parseVersion(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function buildEtag(id, version) {
  return `W/\"${id}:${version}\"`;
}

function buildAccessTokenPayload(user) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    sub: String(user.id),
    identifier: user.identifier,
    iat: nowSeconds,
    exp: nowSeconds + ACCESS_TOKEN_TTL_SECONDS,
  };
}

function issueAccessToken(user) {
  const payload = buildAccessTokenPayload(user);
  return {
    token: jwt.sign(payload, JWT_SECRET),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

function buildRefreshTokenRaw() {
  return crypto.randomBytes(48).toString('base64url');
}

function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || null;
}

function getUserAgent(req) {
  return String(req.headers['user-agent'] || '').trim() || null;
}

function writeAuditLog({ userId = null, identifier = null, eventType, success, req, details = null }) {
  const payload = details && typeof details === 'object' ? JSON.stringify(details) : null;
  db.prepare(`
    INSERT INTO audit_logs (user_id, identifier, event_type, success, ip_address, user_agent, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, identifier, eventType, success ? 1 : 0, getClientIp(req), getUserAgent(req), payload, nowIsoString());
}

function shouldBypassHttps(req) {
  const host = String(req.hostname || '').toLowerCase();
  return ALLOW_INSECURE_LOCALHOST && (host === 'localhost' || host === '127.0.0.1' || host === '::1');
}

function enforceHttps(req, res, next) {
  if (!REQUIRE_HTTPS || shouldBypassHttps(req)) return next();
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isSecure = req.secure || proto === 'https';
  if (isSecure) return next();
  return res.status(426).json({ reason: 'https-required', message: 'HTTPS é obrigatório para autenticação.' });
}

function computeProgressiveLockSeconds(failedAttempts) {
  const exponent = Math.max(0, failedAttempts - 1);
  const seconds = LOGIN_LOCK_BASE_SECONDS * (2 ** exponent);
  return Math.min(LOGIN_LOCK_MAX_SECONDS, seconds);
}

function readRateLimitRecord(fingerprint) {
  return db.prepare('SELECT fingerprint, attempts, window_started_at, blocked_until FROM auth_rate_limits WHERE fingerprint = ? LIMIT 1').get(fingerprint);
}

function writeRateLimitRecord(fingerprint, attempts, windowStartedAt, blockedUntil = null) {
  db.prepare(`
    INSERT INTO auth_rate_limits (fingerprint, attempts, window_started_at, blocked_until)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(fingerprint)
    DO UPDATE SET attempts = excluded.attempts, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until
  `).run(fingerprint, attempts, windowStartedAt, blockedUntil);
}

function clearRateLimitRecord(fingerprint) {
  db.prepare('DELETE FROM auth_rate_limits WHERE fingerprint = ?').run(fingerprint);
}

function checkRateLimit(req, identifier) {
  const ip = getClientIp(req) || 'unknown';
  const fingerprint = `${ip}:${identifier}`;
  const now = new Date();
  const nowIso = now.toISOString();
  const record = readRateLimitRecord(fingerprint);

  if (!record) {
    writeRateLimitRecord(fingerprint, 0, nowIso, null);
    return { blocked: false, fingerprint };
  }

  const blockedUntil = record.blocked_until ? parseIsoDate(record.blocked_until) : null;
  if (blockedUntil && blockedUntil.getTime() > now.getTime()) {
    return { blocked: true, fingerprint, retryAt: blockedUntil.toISOString(), reason: 'too-many-attempts' };
  }

  const windowStartedAt = parseIsoDate(record.window_started_at) || now;
  if ((now.getTime() - windowStartedAt.getTime()) > LOGIN_RATE_WINDOW_SECONDS * 1000) {
    writeRateLimitRecord(fingerprint, 0, nowIso, null);
    return { blocked: false, fingerprint };
  }

  if (record.attempts >= LOGIN_RATE_MAX_ATTEMPTS) {
    const blockedAt = new Date(now.getTime() + LOGIN_LOCK_MAX_SECONDS * 1000).toISOString();
    writeRateLimitRecord(fingerprint, record.attempts, windowStartedAt.toISOString(), blockedAt);
    return { blocked: true, fingerprint, retryAt: blockedAt, reason: 'too-many-attempts' };
  }

  return { blocked: false, fingerprint };
}

function registerFailedRateLimitAttempt(fingerprint) {
  const now = new Date();
  const nowIso = now.toISOString();
  const record = readRateLimitRecord(fingerprint);
  if (!record) {
    writeRateLimitRecord(fingerprint, 1, nowIso, null);
    return;
  }

  const windowStartedAt = parseIsoDate(record.window_started_at) || now;
  if ((now.getTime() - windowStartedAt.getTime()) > LOGIN_RATE_WINDOW_SECONDS * 1000) {
    writeRateLimitRecord(fingerprint, 1, nowIso, null);
    return;
  }

  writeRateLimitRecord(fingerprint, record.attempts + 1, windowStartedAt.toISOString(), null);
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: REQUIRE_HTTPS,
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: REQUIRE_HTTPS,
    sameSite: 'strict',
    path: '/',
  });
}

function createRefreshTokenRecord(userId) {
  const rawToken = buildRefreshTokenRaw();
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
  const result = db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, tokenHash, expiresAt, nowIsoString());

  return {
    id: Number(result.lastInsertRowid),
    token: rawToken,
    expiresAt,
  };
}

function revokeRefreshTokenByHash(tokenHash, replacedById = null) {
  db.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = ?, replaced_by_id = COALESCE(?, replaced_by_id)
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(nowIsoString(), replacedById, tokenHash);
}

function authenticateBearerToken(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ reason: 'session-expired', message: 'Token ausente.' });
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ reason: 'session-expired', message: 'Token inválido.' });
  }

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ reason: 'session-expired', message: 'Sessão expirada.' });
  }
}

function normalizeClientChange(rawChange, defaultDeviceId) {
  if (!rawChange || typeof rawChange !== 'object') return null;
  const id = typeof rawChange.id === 'string' ? rawChange.id.trim() : '';
  if (!id) return null;

  const updatedAt = sanitizeIsoDate(rawChange.updated_at) || nowIsoString();
  const deletedAt = sanitizeIsoDate(rawChange.deleted_at);
  const version = parseVersion(rawChange.version, 1);
  const baseVersion = Number.isInteger(Number(rawChange.base_version)) && Number(rawChange.base_version) >= 0
    ? Number(rawChange.base_version)
    : Math.max(0, version - 1);
  const deviceId = String(rawChange.device_id || defaultDeviceId || '').trim() || null;
  const payload = rawChange.data && typeof rawChange.data === 'object' ? rawChange.data : null;

  return {
    id,
    updatedAt,
    deletedAt,
    version,
    baseVersion,
    deviceId,
    data: deletedAt ? null : payload,
  };
}

function rowToChange(row) {
  let data = null;
  if (row.data) {
    try {
      data = JSON.parse(row.data);
    } catch {
      data = null;
    }
  }

  return {
    id: row.id,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    version: row.version,
    etag: row.etag,
    device_id: row.device_id,
    data,
  };
}

app.use(enforceHttps);

app.post('/auth/login', async (req, res) => {
  const identifier = normalizeIdentifier(req.body?.identifier);
  const secret = String(req.body?.secret || '');

  if (!identifier || !secret) {
    return res.status(400).json({ reason: 'invalid-input', message: 'Informe credenciais válidas.' });
  }

  const rateLimit = checkRateLimit(req, identifier);
  if (rateLimit.blocked) {
    writeAuditLog({ identifier, eventType: 'login-rate-limit-block', success: false, req, details: { retryAt: rateLimit.retryAt } });
    return res.status(429).json({ reason: rateLimit.reason, message: 'Muitas tentativas. Tente novamente mais tarde.', retryAt: rateLimit.retryAt });
  }

  const user = db
    .prepare('SELECT id, identifier, password_hash, is_active, failed_login_attempts, lock_until FROM users WHERE identifier = ? LIMIT 1')
    .get(identifier);

  if (!user || !user.is_active) {
    registerFailedRateLimitAttempt(rateLimit.fingerprint);
    writeAuditLog({ identifier, eventType: 'login-failed-account-not-found', success: false, req });
    return res.status(404).json({ reason: 'account-not-found', message: 'Conta não encontrada.' });
  }

  const lockedUntil = user.lock_until ? parseIsoDate(user.lock_until) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    registerFailedRateLimitAttempt(rateLimit.fingerprint);
    writeAuditLog({ userId: user.id, identifier, eventType: 'login-blocked-progressive-lock', success: false, req, details: { retryAt: lockedUntil.toISOString() } });
    return res.status(423).json({ reason: 'account-locked', message: 'Conta temporariamente bloqueada por tentativas inválidas.', retryAt: lockedUntil.toISOString() });
  }

  const matches = await bcrypt.compare(secret, user.password_hash);
  if (!matches) {
    registerFailedRateLimitAttempt(rateLimit.fingerprint);
    const failedAttempts = Number(user.failed_login_attempts || 0) + 1;
    const lockSeconds = computeProgressiveLockSeconds(failedAttempts);
    const lockUntil = new Date(Date.now() + lockSeconds * 1000).toISOString();
    db.prepare('UPDATE users SET failed_login_attempts = ?, lock_until = ? WHERE id = ?').run(failedAttempts, lockUntil, user.id);
    writeAuditLog({ userId: user.id, identifier, eventType: 'login-failed-invalid-credentials', success: false, req, details: { failedAttempts, retryAt: lockUntil } });
    return res.status(401).json({ reason: 'invalid-credentials', message: 'Credenciais inválidas.' });
  }

  db.prepare('UPDATE users SET failed_login_attempts = 0, lock_until = NULL WHERE id = ?').run(user.id);
  clearRateLimitRecord(rateLimit.fingerprint);

  const session = issueAccessToken(user);
  const refreshToken = createRefreshTokenRecord(user.id);
  setRefreshCookie(res, refreshToken.token);

  writeAuditLog({ userId: user.id, identifier, eventType: 'login-success', success: true, req });
  return res.status(200).json({
    identifier: user.identifier,
    token: session.token,
    expiresAt: session.expiresAt,
  });
});

app.post('/auth/refresh', (req, res) => {
  const refreshToken = String(req.cookies?.[REFRESH_COOKIE_NAME] || '').trim();
  if (!refreshToken) {
    return res.status(401).json({ reason: 'refresh-missing', message: 'Refresh token ausente.' });
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const stored = db.prepare(`
    SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.identifier, u.is_active
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = ?
    LIMIT 1
  `).get(tokenHash);

  if (!stored) {
    clearRefreshCookie(res);
    return res.status(401).json({ reason: 'refresh-invalid', message: 'Refresh token inválido.' });
  }

  if (!stored.is_active || stored.revoked_at || new Date(stored.expires_at).getTime() <= Date.now()) {
    revokeRefreshTokenByHash(tokenHash);
    clearRefreshCookie(res);
    writeAuditLog({ userId: stored.user_id, identifier: stored.identifier, eventType: 'refresh-failed-expired-or-revoked', success: false, req });
    return res.status(401).json({ reason: 'refresh-expired', message: 'Refresh token expirado.' });
  }

  const rotatedToken = createRefreshTokenRecord(stored.user_id);
  revokeRefreshTokenByHash(tokenHash, rotatedToken.id);
  setRefreshCookie(res, rotatedToken.token);

  const session = issueAccessToken({ id: stored.user_id, identifier: stored.identifier });
  writeAuditLog({ userId: stored.user_id, identifier: stored.identifier, eventType: 'refresh-success', success: true, req });
  return res.status(200).json({
    identifier: stored.identifier,
    token: session.token,
    expiresAt: session.expiresAt,
  });
});

app.get('/auth/session', authenticateBearerToken, (req, res) => {
  const user = db
    .prepare('SELECT id, identifier, is_active FROM users WHERE id = ? LIMIT 1')
    .get(Number(req.auth.sub));

  if (!user || !user.is_active) {
    return res.status(401).json({ reason: 'session-expired', message: 'Sessão inválida.' });
  }

  return res.status(200).json({
    identifier: user.identifier,
    expiresAt: new Date(req.auth.exp * 1000).toISOString(),
  });
});

app.post('/auth/logout', (req, res) => {
  const refreshToken = String(req.cookies?.[REFRESH_COOKIE_NAME] || '').trim();
  if (refreshToken) {
    revokeRefreshTokenByHash(hashRefreshToken(refreshToken));
  }
  clearRefreshCookie(res);
  return res.status(204).send();
});

app.get('/users/me/backup', authenticateBearerToken, (req, res) => {
  const userId = Number(req.auth.sub);
  const backup = db
    .prepare('SELECT payload, saved_at FROM user_backups WHERE user_id = ? LIMIT 1')
    .get(userId);

  if (!backup) {
    writeAuditLog({ userId, identifier: req.auth.identifier, eventType: 'sync-backup-read-miss', success: true, req });
    return res.status(404).json({ reason: 'backup-not-found', message: 'Nenhum backup remoto encontrado para esta conta.' });
  }

  try {
    const payload = JSON.parse(backup.payload);
    writeAuditLog({ userId, identifier: req.auth.identifier, eventType: 'sync-backup-read', success: true, req });
    return res.status(200).json({
      payload,
      savedAt: backup.saved_at,
    });
  } catch {
    writeAuditLog({ userId, identifier: req.auth.identifier, eventType: 'sync-backup-read-corrupted', success: false, req });
    return res.status(500).json({ reason: 'backup-corrupted', message: 'Backup remoto inválido.' });
  }
});

app.put('/users/me/backup', authenticateBearerToken, (req, res) => {
  const userId = Number(req.auth.sub);
  const payload = req.body?.payload;

  if (!payload || typeof payload !== 'object') {
    writeAuditLog({ userId, identifier: req.auth.identifier, eventType: 'sync-backup-write-invalid', success: false, req });
    return res.status(400).json({ reason: 'invalid-payload', message: 'Payload de backup inválido.' });
  }

  const savedAt = nowIsoString();
  db.prepare(`
    INSERT INTO user_backups (user_id, payload, saved_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at
  `).run(userId, JSON.stringify(payload), savedAt);

  writeAuditLog({ userId, identifier: req.auth.identifier, eventType: 'sync-backup-write', success: true, req });
  return res.status(200).json({ ok: true, savedAt });
});

app.get('/users/me/changes', authenticateBearerToken, (req, res) => {
  const userId = Number(req.auth.sub);
  const since = sanitizeIsoDate(req.query.since);

  const rows = since
    ? db.prepare(`
      SELECT id, data, updated_at, deleted_at, version, etag, device_id, changed_at
      FROM sync_transactions
      WHERE user_id = ? AND changed_at > ?
      ORDER BY changed_at ASC
    `).all(userId, since)
    : db.prepare(`
      SELECT id, data, updated_at, deleted_at, version, etag, device_id, changed_at
      FROM sync_transactions
      WHERE user_id = ?
      ORDER BY changed_at ASC
    `).all(userId);

  const cursor = rows.length ? rows[rows.length - 1].changed_at : (since || nowIsoString());
  writeAuditLog({ userId, identifier: req.auth.identifier, eventType: 'sync-changes-pull', success: true, req, details: { count: rows.length } });
  return res.status(200).json({
    cursor,
    changes: rows.map(rowToChange),
  });
});

app.put('/users/me/changes', authenticateBearerToken, (req, res) => {
  const userId = Number(req.auth.sub);
  const incomingChanges = Array.isArray(req.body?.changes) ? req.body.changes : null;

  if (!incomingChanges) {
    writeAuditLog({ userId, identifier: req.auth.identifier, eventType: 'sync-changes-push-invalid', success: false, req });
    return res.status(400).json({ reason: 'invalid-payload', message: 'A lista de alterações é obrigatória.' });
  }

  const defaultDeviceId = String(req.body?.device_id || '').trim() || null;
  const normalized = incomingChanges
    .map((change) => normalizeClientChange(change, defaultDeviceId))
    .filter(Boolean);

  const upsert = db.prepare(`
    INSERT INTO sync_transactions (
      user_id, id, data, updated_at, deleted_at, changed_at, version, etag, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id)
    DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      changed_at = excluded.changed_at,
      version = excluded.version,
      etag = excluded.etag,
      device_id = excluded.device_id
  `);
  const findOne = db.prepare('SELECT id, data, updated_at, deleted_at, changed_at, version, etag, device_id FROM sync_transactions WHERE user_id = ? AND id = ? LIMIT 1');

  const applied = [];
  const conflicts = [];

  const run = db.transaction(() => {
    normalized.forEach((change) => {
      const existing = findOne.get(userId, change.id);

      if (!existing) {
        const version = parseVersion(change.version, 1);
        const changedAt = nowIsoString();
        const etag = buildEtag(change.id, version);
        upsert.run(
          userId,
          change.id,
          change.data ? JSON.stringify(change.data) : null,
          change.updatedAt,
          change.deletedAt,
          changedAt,
          version,
          etag,
          change.deviceId,
        );

        applied.push({
          id: change.id,
          updated_at: change.updatedAt,
          deleted_at: change.deletedAt,
          version,
          etag,
          device_id: change.deviceId,
        });
        return;
      }

      if (change.baseVersion !== existing.version) {
        conflicts.push({
          id: change.id,
          reason: 'version-conflict',
          expected_version: existing.version,
          received_base_version: change.baseVersion,
          server: rowToChange(existing),
          client: {
            id: change.id,
            updated_at: change.updatedAt,
            deleted_at: change.deletedAt,
            version: change.version,
            device_id: change.deviceId,
            data: change.data,
          },
        });
        return;
      }

      const version = existing.version + 1;
      const changedAt = nowIsoString();
      const etag = buildEtag(change.id, version);
      upsert.run(
        userId,
        change.id,
        change.data ? JSON.stringify(change.data) : null,
        change.updatedAt,
        change.deletedAt,
        changedAt,
        version,
        etag,
        change.deviceId,
      );

      applied.push({
        id: change.id,
        updated_at: change.updatedAt,
        deleted_at: change.deletedAt,
        version,
        etag,
        device_id: change.deviceId,
      });
    });
  });

  run();
  writeAuditLog({ userId, identifier: req.auth.identifier, eventType: 'sync-changes-push', success: true, req, details: { received: normalized.length, applied: applied.length, conflicts: conflicts.length } });

  return res.status(200).json({
    ok: true,
    applied,
    conflicts,
    cursor: nowIsoString(),
  });
});

app.listen(PORT, () => {
  const mode = REQUIRE_HTTPS ? 'https obrigatório' : 'https opcional';
  console.log(`Auth server running on http://localhost:${PORT} (${mode})`);
});
