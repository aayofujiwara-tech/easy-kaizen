import path from "path";
import type BetterSqlite3 from "better-sqlite3";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Database: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Database = require("better-sqlite3");
} catch {
  console.warn(
    "[DB] better-sqlite3 を読み込めません（Vercel等のサーバーレス環境では正常です）"
  );
}

const DB_PATH = path.join(process.cwd(), "kaizen.db");

let db: BetterSqlite3.Database | null = null;

function getDb(): BetterSqlite3.Database | null {
  if (!Database) return null;
  if (!db) {
    try {
      db = new Database(DB_PATH) as BetterSqlite3.Database;
      db.pragma("journal_mode = WAL");
      db.exec(`
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          emotion TEXT NOT NULL,
          raw_text TEXT NOT NULL,
          image_path TEXT,
          summary TEXT,
          category TEXT,
          priority INTEGER,
          feedback_to_user TEXT,
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          status TEXT DEFAULT 'new',
          base_id TEXT DEFAULT ''
        );
      `);

      // 既存テーブルへの base_id カラム追加（マイグレーション）
      try {
        db.exec(`ALTER TABLE reports ADD COLUMN base_id TEXT DEFAULT ''`);
      } catch {
        // カラムが既に存在する場合は無視
      }
    } catch (e) {
      console.error("[DB] 初期化エラー:", e);
      return null;
    }
  }
  return db;
}

export interface Report {
  id: string;
  emotion: string;
  raw_text: string;
  image_path: string | null;
  summary: string | null;
  category: string | null;
  priority: number | null;
  feedback_to_user: string | null;
  created_at: string;
  status: string;
  base_id: string;
}

export function insertReport(report: {
  id: string;
  emotion: string;
  raw_text: string;
  image_path: string | null;
  base_id: string;
}): void {
  const conn = getDb();
  if (!conn) {
    console.warn("[DB] DB未接続のため insertReport をスキップ");
    return;
  }
  const stmt = conn.prepare(`
    INSERT INTO reports (id, emotion, raw_text, image_path, base_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(report.id, report.emotion, report.raw_text, report.image_path, report.base_id);
}

export function updateReportAiResult(
  id: string,
  result: {
    summary: string;
    category: string;
    priority: number;
    feedback_to_user: string;
  }
): void {
  const conn = getDb();
  if (!conn) {
    console.warn("[DB] DB未接続のため updateReportAiResult をスキップ");
    return;
  }
  const stmt = conn.prepare(`
    UPDATE reports
    SET summary = ?, category = ?, priority = ?, feedback_to_user = ?
    WHERE id = ?
  `);
  stmt.run(
    result.summary,
    result.category,
    result.priority,
    result.feedback_to_user,
    id
  );
}

export function getAllReports(): Report[] {
  const conn = getDb();
  if (!conn) {
    console.warn("[DB] DB未接続のため getAllReports は空配列を返します");
    return [];
  }
  return conn
    .prepare("SELECT * FROM reports ORDER BY created_at DESC")
    .all() as Report[];
}

export function getReportById(id: string): Report | undefined {
  const conn = getDb();
  if (!conn) return undefined;
  return conn.prepare("SELECT * FROM reports WHERE id = ?").get(id) as
    | Report
    | undefined;
}
