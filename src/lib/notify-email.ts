import nodemailer from "nodemailer";

const FALLBACK_TO_EMAIL = "fujiwara@aska-g.com";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const EMOTION_LABELS: Record<string, string> = {
  red: "いかり（問題点）",
  yellow: "ひらめき（アイデア）",
  blue: "グッド（良いこと）",
};

interface NotifyPayload {
  emotion: string;
  rawText: string;
  imageBase64?: string | null;
  imageFileName?: string | null;
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

  if (!smtpHost || smtpHost.startsWith("your_")) {
    console.warn("[Email] SMTP_HOST が未設定またはプレースホルダーのためスキップ");
    return;
  }
  if (smtpUser && smtpUser.startsWith("your_")) {
    console.warn("[Email] SMTP_USER がプレースホルダーのためスキップ");
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
  const hasImage = !!payload.imageBase64;
  const imageStatus = hasImage ? "添付あり" : "なし";

  const subject = `【改善報告】${emotionLabel} 現場から新しい声が届きました`;

  const textBody = [
    "現場から改善報告が届きました。",
    "",
    `■ 感情：${emotionLabel}`,
    `■ 内容：${payload.rawText}`,
    `■ AIの要約：${payload.summary}`,
    `■ 写真：${imageStatus}`,
    "",
    "---",
    "Easy Kaizen 改善報告システム",
  ].join("\n");

  const imageHtml = hasImage
    ? `<p><strong>■ 写真：</strong><br/><img src="cid:reportImage" style="max-width:480px;" /></p>`
    : `<p><strong>■ 写真：</strong>なし</p>`;

  const htmlBody = `
    <div style="font-family: sans-serif; line-height: 1.6;">
      <p>現場から改善報告が届きました。</p>
      <p><strong>■ 感情：</strong>${escapeHtml(emotionLabel)}</p>
      <p><strong>■ 内容：</strong>${escapeHtml(payload.rawText)}</p>
      <p><strong>■ AIの要約：</strong>${escapeHtml(payload.summary)}</p>
      ${imageHtml}
      <hr />
      <p style="color: #888;">Easy Kaizen 改善報告システム</p>
    </div>
  `;

  const attachments = hasImage
    ? [
        {
          filename: payload.imageFileName || "photo.jpg",
          content: Buffer.from(payload.imageBase64!, "base64"),
          cid: "reportImage",
        },
      ]
    : [];

  console.log(`[Email] 通知メールを ${toAddress} へ送信します...`);

  await transporter.sendMail({
    from: fromAddress || `"Easy Kaizen" <noreply@example.com>`,
    to: toAddress,
    subject,
    text: textBody,
    html: htmlBody,
    attachments,
  });

  console.log(`[Email] 送信完了: ${toAddress}`);
}
