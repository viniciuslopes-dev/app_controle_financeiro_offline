import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.AUTH_DB_PATH || path.join(__dirname, 'auth.db');
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

const identifier = String(process.argv[2] || process.env.AUTH_SEED_IDENTIFIER || '').trim().toLowerCase();
const secret = String(process.argv[3] || process.env.AUTH_SEED_SECRET || '').trim();

if (!identifier || !secret) {
  console.error('Uso: npm run auth:init -- <identificador> <senha>');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const hash = await bcrypt.hash(secret, BCRYPT_ROUNDS);

const existing = db.prepare('SELECT id FROM users WHERE identifier = ? LIMIT 1').get(identifier);
if (existing) {
  db.prepare('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?').run(hash, existing.id);
  console.log(`Usuário atualizado: ${identifier}`);
} else {
  db.prepare('INSERT INTO users (identifier, password_hash) VALUES (?, ?)').run(identifier, hash);
  console.log(`Usuário criado: ${identifier}`);
}
