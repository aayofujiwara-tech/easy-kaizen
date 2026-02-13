import { google } from "googleapis";
import { Readable } from "stream";

const EMOTION_LABELS: Record<string, string> = {
  red: "いかり（問題点）",
  yellow: "ひらめき（アイデア）",
  blue: "グッド（良いこと）",
};

const HEADERS = ["日時", "感情", "内容", "AI要約", "優先度", "画像リンク"];

interface SheetPayload {
  emotion: string;
  rawText: string;
  imagePath: string | null;
  summary: string;
  priority: number;
  imageBase64?: string | null;
  imageFileName?: string | null;
}

function getAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) return null;
  if (clientEmail.startsWith("your-") || privateKey.includes("YOUR_KEY_HERE")) return null;

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

async function uploadImageToDrive(
  auth: InstanceType<typeof google.auth.JWT>,
  imageBase64: string,
  fileName: string
): Promise<string> {
  const drive = google.drive({ version: "v3", auth });

  const buffer = Buffer.from(imageBase64, "base64");
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
    },
    media: {
      mimeType: "image/jpeg",
      body: stream,
    },
    fields: "id",
  });

  const fileId = res.data.id!;

  await drive.permissions.create({
    fileId,
    requestBody: {
      type: "anyone",
      role: "reader",
    },
  });

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
    range: "Sheet1!A1:F1",
  });

  if (!headerRes.data.values || headerRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A1:F1",
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
      imageLink = await uploadImageToDrive(
        auth,
        payload.imageBase64,
        payload.imageFileName || "photo.jpg"
      );
    } catch (e) {
      console.error("[Drive] 画像アップロードエラー:", e);
    }
  }

  const now = new Date();
  const timestamp = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const emotionLabel = EMOTION_LABELS[payload.emotion] || payload.emotion;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Sheet1!A:F",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          timestamp,
          emotionLabel,
          payload.rawText,
          payload.summary,
          payload.priority,
          imageLink,
        ],
      ],
    },
  });

  console.log("[Sheets] スプレッドシートに追記完了");
}
