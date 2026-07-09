import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

export type DatabaseHandle = {
  close: () => void;
  getConnection: () => Database.Database;
};

function ensureDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function initialize(connection: Database.Database) {
  connection.pragma("foreign_keys = ON");

  connection.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS materials (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day         TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      content     TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_materials_user_day ON materials(user_id, day);

    CREATE TABLE IF NOT EXISTS material_annotations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      quote       TEXT    NOT NULL,
      note        TEXT    NOT NULL DEFAULT '',
      occurrence  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_material_annotations_material
      ON material_annotations(material_id, id);

    CREATE TABLE IF NOT EXISTS documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL DEFAULT '无标题文档',
      content     TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id, updated_at);

    CREATE TABLE IF NOT EXISTS sys_config (
      id            TEXT PRIMARY KEY,
      config_key    TEXT NOT NULL UNIQUE,
      config_value  TEXT NOT NULL DEFAULT '',
      config_name   TEXT NOT NULL DEFAULT '',
      config_desc   TEXT NOT NULL DEFAULT ''
    );
  `);

  const seedConfigRows = [
    {
      key: "disguise.wiki_brand",
      value: "内部文档中心",
      name: "Wiki 品牌名",
      desc: "Wiki 皮肤顶栏与浏览器标签页显示的伪装名称",
    },
    {
      key: "disguise.csdn_title",
      value: "技术笔记",
      name: "CSDN 大标题",
      desc: "CSDN 皮肤下全局显示的伪装文章标题",
    },
    {
      key: "disguise.csdn_brand",
      value: "技术博客_CSDN",
      name: "CSDN 品牌名",
      desc: "CSDN 皮肤顶栏显示的伪装博客名",
    },
  ];

  const insertConfig = connection.prepare(
    `INSERT OR IGNORE INTO sys_config (id, config_key, config_value, config_name, config_desc)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const row of seedConfigRows) {
    insertConfig.run(crypto.randomUUID(), row.key, row.value, row.name, row.desc);
  }
}

export function createDatabase(filePath: string): DatabaseHandle {
  ensureDirectory(filePath);
  const connection = new Database(filePath);
  initialize(connection);

  return {
    close: () => connection.close(),
    getConnection: () => connection,
  };
}

const defaultDbPath = path.join(process.cwd(), "src", "server", "data", "noteforge.db");

export const database = createDatabase(defaultDbPath);
