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

    // 画像を保存
    if (imageFile && imageFile.size > 0) {
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      await mkdir(uploadsDir, { recursive: true });

      const ext = imageFile.name.split(".").pop() || "jpg";
      const fileName = `${id}.${ext}`;
      imagePath = `/uploads/${fileName}`;

      const bytes = await imageFile.arrayBuffer();
      await writeFile(path.join(uploadsDir, fileName), Buffer.from(bytes));
    }

    // DBに保存
    insertReport({ id, emotion, raw_text: text, image_path: imagePath });

    // AI分析（フィードバックを返すため同期で待つ）
    const aiResult = await analyzeWithAi(emotion, text);
    updateReportAiResult(id, aiResult);

    // Google Sheets保存 + メール通知（fire-and-forget: ユーザーを待たせない）
    const backgroundPayload = {
      emotion,
      rawText: text,
      imagePath: imagePath,
      summary: aiResult.summary,
      priority: aiResult.priority,
    };

    appendToSheet(backgroundPayload).catch((err) =>
      console.error("[Google Sheets] 書き込みエラー:", err)
    );

    sendNotificationEmail(backgroundPayload).catch((err) =>
      console.error("[Email] 送信エラー:", err)
    );

    return NextResponse.json({
      id,
      feedback_to_user: aiResult.feedback_to_user,
      summary: aiResult.summary,
    });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが おきました" },
      { status: 500 }
    );
  }
}
