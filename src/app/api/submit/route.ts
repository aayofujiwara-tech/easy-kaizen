import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { insertReport, updateReportAiResult } from "@/db/database";
import { analyzeWithAi } from "@/lib/ai";
import { appendToSheet } from "@/lib/google-sheets";
import { sendNotificationEmail } from "@/lib/notify-email";
import { checkRateLimit } from "@/lib/rate-limit";
import { BASE_MAP, getBaseLabel } from "@/lib/bases";
import { stripExifData } from "@/lib/strip-exif";

const ALLOWED_EMOTIONS = ["red", "yellow", "blue"];
const MAX_TEXT_LENGTH = 2000;
const MAX_NAME_LENGTH = 50;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// 画像ファイルのマジックバイト検証（MIMEタイプ偽装対策）
const IMAGE_MAGIC_BYTES: { type: string; bytes: number[] }[] = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png",  bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/gif",  bytes: [0x47, 0x49, 0x46, 0x38] },        // GIF87a / GIF89a
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },        // RIFF header
];

function validateImageMagicBytes(buffer: Buffer, claimedType: string): boolean {
  const expected = IMAGE_MAGIC_BYTES.find((m) => m.type === claimedType);
  if (!expected) return false;
  if (buffer.length < expected.bytes.length) return false;
  return expected.bytes.every((b, i) => buffer[i] === b);
}

/*
 * ===== 匿名性に関する設計方針 =====
 * このAPIは以下の原則に基づき、投稿者の個人特定を不可能にする設計です:
 *
 * 1. IPアドレス: レートリミットにのみ使用。ハッシュ化して一時メモリに保持し、DBには一切保存しない。
 * 2. User-Agent / Cookie / セッションID: 取得・保存・ログ出力を一切行わない。
 * 3. 拠点情報(base_id): 「どこを助けるか」を判断するための情報であり、個人を特定するものではない。
 * 4. タイムスタンプ: 日付のみ（時刻なし）を記録し、少人数拠点での推測を防止。
 * 5. 画像: EXIFデータ（撮影日時・GPS・端末情報）を完全除去してから保存・送信。
 * 6. 名前: 任意入力。未入力時は「匿名（とくめい）」として扱う。
 */

export async function POST(req: NextRequest) {
  try {
    // 匿名性担保: IPアドレスはレートリミット判定のみに使用し、ハッシュ化される（rate-limit.ts参照）
    // DB・ログ・通知には一切記録しない
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "おくりすぎだよ、すこし まってね" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
      );
    }

    const formData = await req.formData();
    const emotion = formData.get("emotion") as string;
    const text = formData.get("text") as string;
    const baseId = (formData.get("base_id") as string) || "";
    const reporterNameRaw = (formData.get("reporter_name") as string) || "";
    const imageFile = formData.get("image") as File | null;

    // 名前: 入力がない場合は空文字としてDBに保存（表示時に「匿名（とくめい）」として扱う）
    const reporterName = reporterNameRaw.trim().slice(0, MAX_NAME_LENGTH);

    if (!emotion || !text?.trim()) {
      return NextResponse.json(
        { error: "きもちと ないようを いれてね" },
        { status: 400 }
      );
    }

    if (!ALLOWED_EMOTIONS.includes(emotion)) {
      return NextResponse.json(
        { error: "きもちの しゅるいが ただしくありません" },
        { status: 400 }
      );
    }

    if (baseId && !BASE_MAP[baseId]) {
      return NextResponse.json(
        { error: "きょてんが ただしくありません" },
        { status: 400 }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `ないようは ${MAX_TEXT_LENGTH}もじ いないで いれてね` },
        { status: 400 }
      );
    }

    const id = uuidv4();
    let imageBase64: string | null = null;
    let imageFileName: string | null = null;

    if (imageFile && imageFile.size > 0) {
      if (imageFile.size > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          { error: "がぞうは 5MB いないに してね" },
          { status: 400 }
        );
      }

      if (!ALLOWED_IMAGE_TYPES.includes(imageFile.type)) {
        return NextResponse.json(
          { error: "JPEG, PNG, GIF, WebP のがぞうだけ おくれるよ" },
          { status: 400 }
        );
      }

      try {
        const bytes = await imageFile.arrayBuffer();
        const rawBuffer = Buffer.from(bytes);

        // セキュリティ: マジックバイト検証（MIMEタイプ偽装を防止）
        if (!validateImageMagicBytes(rawBuffer, imageFile.type)) {
          return NextResponse.json(
            { error: "がぞうファイルが ただしくないよ" },
            { status: 400 }
          );
        }

        // プライバシー保護: EXIFデータ（撮影日時・GPS位置情報・端末情報）を完全除去
        const stripped = stripExifData(rawBuffer);
        imageBase64 = stripped.toString("base64");
        imageFileName = imageFile.name?.replace(/[^\w.\-]/g, "_") || "photo.jpg";
      } catch (e) {
        console.warn("[Image] 画像処理をスキップ:", e);
      }
    }

    insertReport({ id, emotion, raw_text: text, image_path: null, base_id: baseId, reporter_name: reporterName });

    const aiResult = await analyzeWithAi(emotion, text);
    updateReportAiResult(id, aiResult);

    const baseName = baseId ? getBaseLabel(baseId) : "";
    // 表示用の名前: 未入力時は「匿名（とくめい）」
    const displayName = reporterName || "匿名（とくめい）";

    const backgroundPayload = {
      emotion,
      rawText: text,
      imagePath: null as string | null,
      imageBase64,
      imageFileName,
      summary: aiResult.summary,
      priority: aiResult.priority,
      baseName,
      category: aiResult.category,
      reporterName: displayName,
    };

    // Vercelサーバーレス環境ではレスポンス後にバックグラウンド処理が実行されないため
    // awaitで完了を待つ必要がある
    const [sheetsResult, emailResult] = await Promise.allSettled([
      appendToSheet(backgroundPayload),
      sendNotificationEmail(backgroundPayload),
    ]);

    if (sheetsResult.status === "rejected") {
      console.error("[Google Sheets] 書き込みエラー:", sheetsResult.reason);
    }
    if (emailResult.status === "rejected") {
      console.error("[Email] 送信エラー:", emailResult.reason);
    }

    return NextResponse.json({
      id,
      feedback_to_user: aiResult.feedback_to_user,
      summary: aiResult.summary,
    });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json(
      { error: "送信に失敗しました" },
      { status: 500 }
    );
  }
}
