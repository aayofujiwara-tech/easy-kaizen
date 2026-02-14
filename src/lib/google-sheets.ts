import { google } from "googleapis";
import { Readable } from "stream";

const EMOTION_LABELS: Record<string, string> = {
  red: "いかり（問題点）",
  yellow: "ひらめき（アイデア）",
  blue: "グッド（良いこと）",
};

// 匿名性担保: 保存項目は以下の4カテゴリに限定
// 1. 拠点名（URLパラメータまたは選択値）
// 2. 投稿内容（テキスト、画像、感情、AI解析結果）
// 3. 名前（ユーザーが自ら入力した場合のみ。未入力時は「匿名」）
// 4. 投稿日（日付のみ。時刻は含めない — 少人数拠点での個人推測を防止）
const HEADERS = ["No.", "投稿日", "拠点名", "名前", "感情", "優先度", "カテゴリ", "内容", "AI要約", "画像リンク"];

// 対応管理シート（印刷・掲示用）
// 管理者が「ステータス」「対応メモ」列を手動で更新して運用する
// No.列でSheet1と対応管理シートを照合できる
const STATUS_SHEET_NAME = "対応管理";
const STATUS_HEADERS = [
  "No.",
  "投稿日",
  "拠点名",
  "カテゴリ",
  "優先度",
  "AI要約",
  "ステータス",    // 管理者が手動入力: 新規→確認済→対応中→完了
  "対応メモ",      // 管理者が自由記入
];

interface SheetPayload {
  emotion: string;
  rawText: string;
  imagePath: string | null;
  summary: string;
  priority: number;
  category?: string;
  imageBase64?: string | null;
  imageFileName?: string | null;
  baseName?: string;
  reporterName?: string;
}

function getAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) return null;
  if (clientEmail.startsWith("your-") || privateKey.includes("YOUR_KEY_HERE")) return null;

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

async function uploadImageToDrive(
  auth: InstanceType<typeof google.auth.JWT>,
  imageBase64: string,
  fileName: string
): Promise<string | null> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    console.log("[Drive] スキップ: GOOGLE_DRIVE_FOLDER_ID 未設定");
    return null;
  }

  const drive = google.drive({ version: "v3", auth });

  const buffer = Buffer.from(imageBase64, "base64");
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const safeName = fileName.replace(/[^\w.\-]/g, "_");

  // 匿名性担保: ファイルの作成日時・更新日時を当日0:00:00(UTC)に固定し、
  // 正確なアップロード時刻がDriveのメタデータから推測されることを防止する
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dateOnlyISO = today.toISOString(); // "2026-02-14T00:00:00.000Z"

  const res = await drive.files.create({
    requestBody: {
      name: safeName,
      parents: [folderId],
      createdTime: dateOnlyISO,
      modifiedTime: dateOnlyISO,
    },
    media: {
      mimeType: "image/jpeg",
      body: stream,
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const fileId = res.data.id!;
  console.log("[Drive] アップロード成功 fileId:", fileId);

  // ファイルはDriveフォルダの権限を継承するため、個別の公開設定は行わない
  // フォルダ側で適切なアクセス権限を設定すること

  return `https://drive.google.com/file/d/${fileId}/view`;
}

export async function appendToSheet(payload: SheetPayload): Promise<void> {
  const spreadsheetId =
    process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SPREADSHEET_ID;

  const auth = getAuth();

  if (!spreadsheetId || !auth) {
    console.log("[Sheets] スキップ: 環境変数未設定");
    return;
  }
  if (spreadsheetId.startsWith("your_")) {
    console.log("[Sheets] スキップ: 環境変数未設定");
    return;
  }

  const sheets = google.sheets({ version: "v4", auth });

  // ヘッダー確認・追加（Sheet1: 投稿ログ）
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Sheet1!A1:J1",
  });

  if (!headerRes.data.values || headerRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A1:J1",
      valueInputOption: "RAW",
      requestBody: {
        values: [HEADERS],
      },
    });
  }

  // 対応管理シートの初期化（存在しなければ作成）
  await ensureStatusSheet(sheets, spreadsheetId);

  // 通し番号を取得（Sheet1のデータ行数 + 1）
  const seqNo = await getNextSeqNo(sheets, spreadsheetId);

  // 画像をGoogle Driveにアップロード
  let imageLink = "";
  if (payload.imageBase64) {
    try {
      const link = await uploadImageToDrive(
        auth,
        payload.imageBase64,
        payload.imageFileName || "photo.jpg"
      );
      if (link) imageLink = link;
    } catch (e) {
      console.error("[Drive] 画像アップロードエラー:", e);
    }
  }

  // 匿名性担保: 日付のみ記録（時刻は含めない）
  const now = new Date();
  const dateOnly = now.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const emotionLabel = EMOTION_LABELS[payload.emotion] || payload.emotion;
  const displayName = payload.reporterName || "匿名（とくめい）";
  const categoryLabel = payload.category || "";

  // Sheet1: 投稿ログ（全情報）
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Sheet1!A:J",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          seqNo,
          dateOnly,
          payload.baseName || "",
          displayName,
          emotionLabel,
          payload.priority,
          categoryLabel,
          payload.rawText,
          payload.summary,
          imageLink,
        ],
      ],
    },
  });

  // 対応管理シート: ステータス管理用（印刷・掲示向け）
  // 「ステータス」は「新規」、「対応メモ」は空欄で初期化 — 管理者が手動で更新
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${STATUS_SHEET_NAME}!A:H`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          seqNo,
          dateOnly,
          payload.baseName || "",
          categoryLabel,
          payload.priority,
          payload.summary,
          "新規",       // ステータス初期値
          "",           // 対応メモ（管理者が記入）
        ],
      ],
    },
  });

  console.log(`[Sheets] No.${seqNo} — 投稿ログ + 対応管理シートに追記完了`);
}

/** Sheet1のデータ行数から次の通し番号を算出 */
async function getNextSeqNo(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<number> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:A",
    });
    // ヘッダー行を除いたデータ行数 + 1
    const rowCount = res.data.values ? res.data.values.length - 1 : 0;
    return Math.max(1, rowCount + 1);
  } catch {
    return 1;
  }
}

/** 対応管理シートが存在しなければ作成し、ヘッダーを書き込む */
async function ensureStatusSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<void> {
  try {
    // シートの存在確認
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
    const sheetNames = meta.data.sheets?.map((s) => s.properties?.title) || [];

    if (sheetNames.includes(STATUS_SHEET_NAME)) return;

    // シートを新規作成
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: STATUS_SHEET_NAME } } }],
      },
    });

    // ヘッダー書き込み
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${STATUS_SHEET_NAME}!A1:H1`,
      valueInputOption: "RAW",
      requestBody: { values: [STATUS_HEADERS] },
    });

    console.log("[Sheets] 対応管理シートを作成しました");
  } catch (e) {
    console.warn("[Sheets] 対応管理シートの初期化をスキップ:", e);
  }
}
