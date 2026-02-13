import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { insertReport, updateReportAiResult } from "@/db/database";
import { analyzeWithAi } from "@/lib/ai";
import { appendToSheet } from "@/lib/google-sheets";
import { sendNotificationEmail } from "@/lib/notify-email";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const emotion = formData.get("emotion") as string;
    const text = formData.get("text") as string;
    const imageFile = formData.get("image") as File | null;

    if (!emotion || !text?.trim()) {
      return NextResponse.json(
        { error: "きもちと ないようを いれてね" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    let imagePath: string | null = null;

    if (imageFile && imageFile.size > 0) {
      try {
        const uploadsDir = path.join(process.cwd(), "public", "uploads");
        await mkdir(uploadsDir, { recursive: true });

        const ext = imageFile.name.split(".").pop() || "jpg";
        const fileName = `${id}.${ext}`;
        imagePath = `/uploads/${fileName}`;

        const bytes = await imageFile.arrayBuffer();
        await writeFile(path.join(uploadsDir, fileName), Buffer.from(bytes));
      } catch (e) {
        console.warn("[Image] 画像保存をスキップ:", e);
        imagePath = null;
      }
    }

    insertReport({ id, emotion, raw_text: text, image_path: imagePath });

    const aiResult = await analyzeWithAi(emotion, text);
    updateReportAiResult(id, aiResult);

    const backgroundPayload = {
      emotion,
      rawText: text,
      imagePath: imagePath,
      summary: aiResult.summary,
      priority: aiResult.priority,
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
      { error: "送信に失敗しました", detail: String(error) },
      { status: 500 }
    );
  }
}
