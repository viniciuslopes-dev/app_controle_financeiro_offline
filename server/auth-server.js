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
`);

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
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

  const savedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO user_backups (user_id, payload, saved_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at
  `).run(userId, JSON.stringify(payload), savedAt);

  return res.status(200).json({ ok: true, savedAt });
});

app.listen(PORT, () => {
  console.log(`Auth server running on http://localhost:${PORT}`);
});
