import nodemailer from "nodemailer";

const FALLBACK_TO_EMAIL = "fujiwara@aska-g.com";

const EMOTION_LABELS: Record<string, string> = {
  red: "いかり（問題点）",
  yellow: "ひらめき（アイデア）",
  blue: "グッド（良いこと）",
};

interface NotifyPayload {
  emotion: string;
  rawText: string;
  imagePath: string | null;
  summary: string;
}

export async function sendNotificationEmail(
  payload: NotifyPayload
): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromAddress = process.env.NOTIFY_FROM_EMAIL;
  const toAddress = process.env.NOTIFY_TO_EMAIL || FALLBACK_TO_EMAIL;

  if (!smtpHost) {
    console.warn("[Email] SMTP_HOST が未設定のためスキップ");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort) || 587,
    secure: Number(smtpPort) === 465,
    auth:
      smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
  });

  const emotionLabel = EMOTION_LABELS[payload.emotion] || payload.emotion;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  const imageUrl = payload.imagePath
    ? `${baseUrl}${payload.imagePath}`
    : "なし";

  const subject = `【改善報告】${emotionLabel} 現場から新しい声が届きました`;

  const body = [
    "現場から改善報告が届きました。",
    "",
    `■ 感情：${emotionLabel}`,
    `■ 内容：${payload.rawText}`,
    `■ AIの要約：${payload.summary}`,
    `■ 写真リンク：${imageUrl}`,
    "",
    "---",
    "Easy Kaizen 改善報告システム",
  ].join("\n");

  console.log(`[Email] 通知メールを ${toAddress} へ送信します...`);

  await transporter.sendMail({
    from: fromAddress || `"Easy Kaizen" <noreply@example.com>`,
    to: toAddress,
    subject,
    text: body,
  });

  console.log(`[Email] 送信完了: ${toAddress}`);
}
