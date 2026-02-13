import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

const EMOTION_LABELS: Record<string, string> = {
  red: "いかり（問題点）",
  yellow: "ひらめき（アイデア）",
  blue: "グッド（良いこと）",
};

interface SheetRow {
  emotion: string;
  rawText: string;
  imagePath: string | null;
  summary: string;
  priority: number;
}

export async function appendToSheet(row: SheetRow): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!spreadsheetId || !clientEmail || !privateKey) {
    console.warn("[Google Sheets] 環境変数が未設定のためスキップ");
    return;
  }
  if (spreadsheetId.startsWith("your_") || clientEmail.startsWith("your-") || privateKey.includes("YOUR_KEY_HERE")) {
    console.warn("[Google Sheets] プレースホルダー値のためスキップ");
    return;
  }

  const auth = new JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  const sheet = doc.sheetsByIndex[0];

  const now = new Date();
  const timestamp = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  const imageUrl = row.imagePath ? `${baseUrl}${row.imagePath}` : "";

  await sheet.addRow({
    投稿日時: timestamp,
    感情: EMOTION_LABELS[row.emotion] || row.emotion,
    入力テキスト: row.rawText,
    写真URL: imageUrl,
    AI要約: row.summary,
    緊急度: row.priority,
  });
}
