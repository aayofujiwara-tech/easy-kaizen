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
const HEADERS = ["投稿日", "拠点名", "名前", "感情", "優先度", "内容", "AI要約", "画像リンク"];

interface SheetPayload {
  emotion: string;
  rawText: string;
  imagePath: string | null;
  summary: string;
  priority: number;
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

  const res = await drive.files.create({
    requestBody: {
      name: safeName,
      parents: [folderId],
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

  // ヘッダー確認・追加
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Sheet1!A1:H1",
  });

  if (!headerRes.data.values || headerRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A1:H1",
      valueInputOption: "RAW",
      requestBody: {
        values: [HEADERS],
      },
    });
  }

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

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Sheet1!A:H",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          dateOnly,
          payload.baseName || "",
          displayName,
          emotionLabel,
          payload.priority,
          payload.rawText,
          payload.summary,
          imageLink,
        ],
      ],
    },
  });

  console.log("[Sheets] スプレッドシートに追記完了");
}
