"use strict";

// SQLite test factory — direct node:sqlite access to the SAME DB file the app
// uses, so tests can seed chats/messages and clear/reset the DB for scenarios.
//
// The app (server.js) opens the DB with WAL + busy_timeout=5000, and this
// factory does the same, so the two can coexist on the shared file (the app
// reads rows the factory inserts; the factory can clear between scenarios).
// In the two-container Docker setup, both containers share the DB file via a
// mounted volume (SCRATCH_DB_PATH points at it in both).
//
// Requires Node 22.5+ for node:sqlite (same as the server).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (_) { /* handled on open */ }

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT,
    lang TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT,
    seq INTEGER,
    role TEXT,
    content TEXT,
    blocks TEXT,
    created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, seq);
`;

const now = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID();

class SqliteFactory {
  constructor(dbPath) {
    this.dbPath = dbPath || (process.env.SCRATCH_DB_PATH || 'test-data/scratch_helper.test.db');
    this.db = null;
  }

  open() {
    if (!DatabaseSync) {
      throw new Error('node:sqlite is not available on this Node build (need Node 22.5+).');
    }
    fs.mkdirSync(path.dirname(this.dbPath) || '.', { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA busy_timeout=5000');
    this.db.exec(SCHEMA);
    return this;
  }

  close() {
    if (this.db) { try { this.db.close(); } catch (_) {} this.db = null; }
  }

  _ensure() {
    if (!this.db) throw new Error('SqliteFactory is not open — call open() first.');
  }

  // Clear every row but keep the schema and file.
  clear() {
    this._ensure();
    this.db.exec('DELETE FROM messages');
    this.db.exec('DELETE FROM chats');
    return this;
  }

  // Drop and recreate the tables.
  reset() {
    this._ensure();
    this.db.exec('DROP TABLE IF EXISTS messages');
    this.db.exec('DROP TABLE IF EXISTS chats');
    this.db.exec(SCHEMA);
    return this;
  }

  // Delete the DB file (and WAL/shm/journal sidecars) and open a fresh empty one.
  createNew() {
    this.close();
    for (const ext of ['', '-wal', '-shm', '-journal']) {
      try { fs.unlinkSync(this.dbPath + ext); } catch (_) {}
    }
    return this.open();
  }

  insertChat({ title = null, lang = 'en', id, createdAt } = {}) {
    this._ensure();
    const cid = id || uuid();
    const t = createdAt || now();
    this.db
      .prepare('INSERT INTO chats (id, title, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(cid, title, lang, t, t);
    return { id: cid, title, lang, created_at: t, updated_at: t };
  }

  insertMessage({ chatId, role = 'user', content = '', blocks = null, seq } = {}) {
    this._ensure();
    if (!chatId) throw new Error('insertMessage: chatId is required.');
    const t = now();
    const s = seq != null
      ? seq
      : ((this.db.prepare('SELECT COALESCE(MAX(seq), -1) AS m FROM messages WHERE chat_id = ?').get(chatId).m || 0) + 1);
    const mid = uuid();
    this.db
      .prepare('INSERT INTO messages (id, chat_id, seq, role, content, blocks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(mid, chatId, s, role === 'assistant' ? 'assistant' : 'user', content, blocks, t);
    this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(t, chatId);
    return { id: mid, chatId, seq: s, role, content, blocks, created_at: t };
  }

  // Seed a full conversation in one call. turns: [{ role, content, blocks? }].
  insertConversation({ title = null, lang = 'en', turns = [] } = {}) {
    this._ensure();
    const chat = this.insertChat({ title, lang });
    let seq = 0;
    for (const turn of turns) {
      seq += 1;
      this.insertMessage({
        chatId: chat.id,
        role: turn.role,
        content: turn.content,
        blocks: turn.blocks,
        seq,
      });
    }
    return chat;
  }

  listChats() {
    this._ensure();
    return this.db.prepare('SELECT id, title, lang, updated_at FROM chats ORDER BY updated_at DESC').all();
  }

  getChat(id) {
    this._ensure();
    return {
      chat: this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id),
      messages: this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY seq ASC').all(id),
    };
  }
}

function createFactory(dbPath) {
  return new SqliteFactory(dbPath);
}

module.exports = { SqliteFactory, createFactory };