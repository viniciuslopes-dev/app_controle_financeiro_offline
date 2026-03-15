import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.AUTH_DB_PATH || path.join(__dirname, 'auth.db');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS || 60 * 60 * 8);
const PORT = Number(process.env.PORT || 3000);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_backups (
    user_id INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function nowIsoString() {
  return new Date().toISOString();
}

function sanitizeIsoDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const stamp = new Date(text).getTime();
  return Number.isNaN(stamp) ? null : new Date(stamp).toISOString();
}

function parseVersion(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function buildEtag(id, version) {
  return `W/\"${id}:${version}\"`;
}

function issueSessionToken(user) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(user.id),
    identifier: user.identifier,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
  };

  return {
    token: jwt.sign(payload, JWT_SECRET),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
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

app.post('/auth/login', async (req, res) => {
  const identifier = normalizeIdentifier(req.body?.identifier);
  const secret = String(req.body?.secret || '');

  if (!identifier || !secret) {
    return res.status(400).json({ reason: 'invalid-input', message: 'Informe credenciais válidas.' });
  }

  const user = db
    .prepare('SELECT id, identifier, password_hash, is_active FROM users WHERE identifier = ? LIMIT 1')
    .get(identifier);

  if (!user || !user.is_active) {
    return res.status(404).json({ reason: 'account-not-found', message: 'Conta não encontrada.' });
  }

  const matches = await bcrypt.compare(secret, user.password_hash);
  if (!matches) {
    return res.status(401).json({ reason: 'invalid-credentials', message: 'Credenciais inválidas.' });
  }

  const session = issueSessionToken(user);
  return res.status(200).json({
    identifier: user.identifier,
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

app.post('/auth/logout', (_req, res) => {
  return res.status(204).send();
});

app.get('/users/me/backup', authenticateBearerToken, (req, res) => {
  const userId = Number(req.auth.sub);
  const backup = db
    .prepare('SELECT payload, saved_at FROM user_backups WHERE user_id = ? LIMIT 1')
    .get(userId);

  if (!backup) {
    return res.status(404).json({ reason: 'backup-not-found', message: 'Nenhum backup remoto encontrado para esta conta.' });
  }

  try {
    const payload = JSON.parse(backup.payload);
    return res.status(200).json({
      payload,
      savedAt: backup.saved_at,
    });
  } catch {
    return res.status(500).json({ reason: 'backup-corrupted', message: 'Backup remoto inválido.' });
  }
});

app.put('/users/me/backup', authenticateBearerToken, (req, res) => {
  const userId = Number(req.auth.sub);
  const payload = req.body?.payload;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ reason: 'invalid-payload', message: 'Payload de backup inválido.' });
  }

  const savedAt = nowIsoString();
  db.prepare(`
    INSERT INTO user_backups (user_id, payload, saved_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at
  `).run(userId, JSON.stringify(payload), savedAt);

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
  return res.status(200).json({
    cursor,
    changes: rows.map(rowToChange),
  });
});

app.put('/users/me/changes', authenticateBearerToken, (req, res) => {
  const userId = Number(req.auth.sub);
  const incomingChanges = Array.isArray(req.body?.changes) ? req.body.changes : null;

  if (!incomingChanges) {
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

  return res.status(200).json({
    ok: true,
    applied,
    conflicts,
    cursor: nowIsoString(),
  });
});

app.listen(PORT, () => {
  console.log(`Auth server running on http://localhost:${PORT}`);
});
