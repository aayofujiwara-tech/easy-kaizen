import path from "path";
import type BetterSqlite3 from "better-sqlite3";

/*
 * ===== SQLite サーバーレス環境の制約 =====
 *
 * 重要: Vercel等のサーバーレス環境では以下の制約があります:
 *
 * 1. ファイルシステムがエフェメラル（一時的）なため、
 *    関数インスタンス間でDBファイルが共有されない。
 *    → 投稿APIと読み取りAPIが別インスタンスで実行されると、データが見えない。
 *
 * 2. コールドスタート時にDBが空の状態から始まる。
 *
 * 3. /var/task（デプロイディレクトリ）はビルド後は読み取り専用の場合がある。
 *
 * 本番運用でデータ永続化が必要な場合は、以下のいずれかへの移行を推奨:
 *   - Vercel Postgres / Neon / Supabase（PostgreSQL系）
 *   - Turso / LiteFS（SQLite互換のエッジDB）
 *   - PlanetScale（MySQL互換）
 *
 * 現在はGoogle Sheetsへの書き込みがバックアップとして機能しています。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Database: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Database = require("better-sqlite3");
} catch {
  console.warn(
    "[DB] better-sqlite3 を読み込めません — Vercel等のサーバーレス環境ではGoogle Sheetsがデータの永続化先になります"
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
      // 匿名性担保: IPアドレス・User-Agent・Cookie・セッションID等の個人特定情報は一切保存しない
      // タイムスタンプは日付のみ（時刻なし）で保存し、少人数拠点での個人推測を防止する
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
          created_at TEXT DEFAULT (date('now', 'localtime')),
          status TEXT DEFAULT 'new',
          base_id TEXT DEFAULT '',
          reporter_name TEXT DEFAULT ''
        );
      `);

      // パフォーマンス: フィルタ・ソートに使われるカラムにインデックスを追加
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_reports_base_id ON reports(base_id);
        CREATE INDEX IF NOT EXISTS idx_reports_emotion ON reports(emotion);
        CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
        CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
      `);

      // 既存テーブルへの base_id カラム追加（マイグレーション）
      try {
        db.exec(`ALTER TABLE reports ADD COLUMN base_id TEXT DEFAULT ''`);
      } catch {
        // カラムが既に存在する場合は無視
      }

      // 既存テーブルへの reporter_name カラム追加（マイグレーション）
      try {
        db.exec(`ALTER TABLE reports ADD COLUMN reporter_name TEXT DEFAULT ''`);
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
  reporter_name: string;
}

export function insertReport(report: {
  id: string;
  emotion: string;
  raw_text: string;
  image_path: string | null;
  base_id: string;
  reporter_name: string;
}): void {
  const conn = getDb();
  if (!conn) {
    console.warn("[DB] DB未接続のため insertReport をスキップ");
    return;
  }
  const stmt = conn.prepare(`
    INSERT INTO reports (id, emotion, raw_text, image_path, base_id, reporter_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(report.id, report.emotion, report.raw_text, report.image_path, report.base_id, report.reporter_name);
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

// ステータスワークフロー: new → acknowledged → in_progress → resolved
export const VALID_STATUSES = ["new", "acknowledged", "in_progress", "resolved"] as const;
export type ReportStatus = (typeof VALID_STATUSES)[number];

export function updateReportStatus(id: string, status: ReportStatus): boolean {
  const conn = getDb();
  if (!conn) {
    console.warn("[DB] DB未接続のため updateReportStatus をスキップ");
    return false;
  }
  const result = conn
    .prepare("UPDATE reports SET status = ? WHERE id = ?")
    .run(status, id);
  return result.changes > 0;
}

export interface ReportQuery {
  page?: number;
  limit?: number;
  emotion?: string;
  base_id?: string;
  status?: string;
  keyword?: string;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;   // YYYY-MM-DD
}

export interface PaginatedReports {
  reports: Report[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** LIKE検索用: ワイルドカード文字をエスケープし、意図しないパターンマッチを防止する */
function escapeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export function queryReports(query: ReportQuery): PaginatedReports {
  const conn = getDb();
  if (!conn) {
    console.warn("[DB] DB未接続のため queryReports は空を返します");
    return { reports: [], total: 0, page: 1, limit: 20, totalPages: 0 };
  }

  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.emotion && query.emotion !== "all") {
    conditions.push("emotion = ?");
    params.push(query.emotion);
  }
  if (query.base_id && query.base_id !== "all") {
    conditions.push("base_id = ?");
    params.push(query.base_id);
  }
  if (query.status && query.status !== "all") {
    conditions.push("status = ?");
    params.push(query.status);
  }
  if (query.keyword) {
    conditions.push("(raw_text LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR reporter_name LIKE ? ESCAPE '\\')");
    const like = `%${escapeLikePattern(query.keyword)}%`;
    params.push(like, like, like);
  }
  if (query.date_from) {
    conditions.push("created_at >= ?");
    params.push(query.date_from);
  }
  if (query.date_to) {
    conditions.push("created_at <= ?");
    params.push(query.date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = (
    conn.prepare(`SELECT COUNT(*) as count FROM reports ${where}`).get(...params) as { count: number }
  ).count;

  const offset = (page - 1) * limit;
  const reports = conn
    .prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Report[];

  return {
    reports,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
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

/** 対応状況ボード用: 拠点別レポートの公開情報のみ返す（raw_text・reporter_name は非公開） */
export interface BoardReport {
  id: string;
  emotion: string;
  summary: string | null;
  category: string | null;
  priority: number | null;
  status: string;
  created_at: string;
}

export function queryBoardReports(baseId: string): BoardReport[] {
  const conn = getDb();
  if (!conn) return [];
  return conn
    .prepare(
      `SELECT id, emotion, summary, category, priority, status, created_at
       FROM reports WHERE base_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`
    )
    .all(baseId) as BoardReport[];
}

/** 集計: 感情別・ステータス別・拠点別の件数 */
export interface ReportStats {
  byEmotion: { emotion: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byBase: { base_id: string; count: number }[];
  byMonth: { month: string; count: number }[];
  total: number;
}

export function getReportStats(): ReportStats {
  const conn = getDb();
  if (!conn) {
    return { byEmotion: [], byStatus: [], byBase: [], byMonth: [], total: 0 };
  }

  const byEmotion = conn
    .prepare("SELECT emotion, COUNT(*) as count FROM reports GROUP BY emotion")
    .all() as { emotion: string; count: number }[];

  const byStatus = conn
    .prepare("SELECT status, COUNT(*) as count FROM reports GROUP BY status")
    .all() as { status: string; count: number }[];

  const byBase = conn
    .prepare("SELECT base_id, COUNT(*) as count FROM reports WHERE base_id != '' GROUP BY base_id")
    .all() as { base_id: string; count: number }[];

  const byMonth = conn
    .prepare(
      `SELECT substr(created_at, 1, 7) as month, COUNT(*) as count
       FROM reports GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all() as { month: string; count: number }[];

  const total = (
    conn.prepare("SELECT COUNT(*) as count FROM reports").get() as { count: number }
  ).count;

  return { byEmotion, byStatus, byBase, byMonth, total };
}

/** CSV出力用: フィルタ付き全件取得（raw_textを含む、認証済みダッシュボード専用） */
export function queryReportsForExport(query: ReportQuery): Report[] {
  const conn = getDb();
  if (!conn) return [];

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.emotion && query.emotion !== "all") {
    conditions.push("emotion = ?");
    params.push(query.emotion);
  }
  if (query.base_id && query.base_id !== "all") {
    conditions.push("base_id = ?");
    params.push(query.base_id);
  }
  if (query.status && query.status !== "all") {
    conditions.push("status = ?");
    params.push(query.status);
  }
  if (query.keyword) {
    conditions.push("(raw_text LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR reporter_name LIKE ? ESCAPE '\\')");
    const like = `%${escapeLikePattern(query.keyword)}%`;
    params.push(like, like, like);
  }
  if (query.date_from) {
    conditions.push("created_at >= ?");
    params.push(query.date_from);
  }
  if (query.date_to) {
    conditions.push("created_at <= ?");
    params.push(query.date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return conn
    .prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC, id DESC`)
    .all(...params) as Report[];
}
