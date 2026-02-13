import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "kaizen.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database) {
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
      status TEXT DEFAULT 'new'
    );
  `);
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
}

export function insertReport(report: {
  id: string;
  emotion: string;
  raw_text: string;
  image_path: string | null;
}): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO reports (id, emotion, raw_text, image_path)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(report.id, report.emotion, report.raw_text, report.image_path);
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
  const db = getDb();
  const stmt = db.prepare(`
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
  const db = getDb();
  return db
    .prepare("SELECT * FROM reports ORDER BY created_at DESC")
    .all() as Report[];
}

export function getReportById(id: string): Report | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as
    | Report
    | undefined;
}
