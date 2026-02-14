import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { insertReport, updateReportAiResult } from "@/db/database";
import { analyzeWithAi } from "@/lib/ai";
import { appendToSheet } from "@/lib/google-sheets";
import { sendNotificationEmail } from "@/lib/notify-email";
import { checkRateLimit } from "@/lib/rate-limit";
import { BASE_MAP, getBaseLabel } from "@/lib/bases";

const ALLOWED_EMOTIONS = ["red", "yellow", "blue"];
const MAX_TEXT_LENGTH = 2000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(req: NextRequest) {
  try {
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
    const imageFile = formData.get("image") as File | null;

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
        imageBase64 = Buffer.from(bytes).toString("base64");
        imageFileName = imageFile.name?.replace(/[^\w.\-]/g, "_") || "photo.jpg";
      } catch (e) {
        console.warn("[Image] 画像のBase64変換をスキップ:", e);
      }
    }

    insertReport({ id, emotion, raw_text: text, image_path: null, base_id: baseId });

    const aiResult = await analyzeWithAi(emotion, text);
    updateReportAiResult(id, aiResult);

    const baseName = baseId ? getBaseLabel(baseId) : "";

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
