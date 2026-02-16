import nodemailer from "nodemailer";

// 送信先は環境変数 NOTIFY_TO_EMAIL で設定する（未設定時はメール送信をスキップ）

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const EMOTION_SUBJECT_LABELS: Record<string, string> = {
  red: "もんだいてん",
  yellow: "ていあん",
  blue: "ナイス",
};

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
  baseName?: string;
  reporterName?: string;
}

export async function sendNotificationEmail(
  payload: NotifyPayload
): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromAddress = process.env.NOTIFY_FROM_EMAIL;
  const toAddress = process.env.NOTIFY_TO_EMAIL;

  if (!toAddress || toAddress.startsWith("your_")) {
    console.warn("[Email] NOTIFY_TO_EMAIL が未設定のためスキップ");
    return;
  }
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
  const emotionSubjectLabel = EMOTION_SUBJECT_LABELS[payload.emotion] || payload.emotion;
  const hasImage = !!payload.imageBase64;
  const displayName = payload.reporterName || "匿名（とくめい）";

  // 匿名性担保: 日付のみ記録（時刻は含めない）
  const now = new Date();
  const dateOnly = now.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const basePrefix = payload.baseName ? `${payload.baseName}：` : "";
  const subject = `【改善報告】${basePrefix}${emotionSubjectLabel} 現場から新しい声が届きました`;

  // 匿名性担保: 通知項目は4カテゴリのみ（投稿者を推測させる情報は含めない）
  // 1. 拠点名  2. 投稿内容（感情・テキスト・AI要約・画像）  3. 名前  4. 投稿日（日付のみ）
  const textBody = [
    "現場から改善報告が届きました。",
    "",
    `■ 投稿日：${dateOnly}`,
    ...(payload.baseName ? [`■ 拠点：${payload.baseName}`] : []),
    `■ 名前：${displayName}`,
    `■ 感情：${emotionLabel}`,
    `■ 内容：${payload.rawText}`,
    `■ AIの要約：${payload.summary}`,
    ...(hasImage ? ["■ 写真：添付あり"] : []),
    "",
    "---",
    "※この報告は匿名で送信されています。個人情報やデバイス情報は含まれていません。",
    "Easy Kaizen 改善報告システム",
  ].join("\n");

  const imageHtml = hasImage
    ? `<p><strong>■ 写真：</strong><br/><img src="cid:reportImage" style="max-width:480px;" /></p>`
    : "";

  const baseHtml = payload.baseName
    ? `<p><strong>■ 拠点：</strong>${escapeHtml(payload.baseName)}</p>`
    : "";

  const htmlBody = `
    <div style="font-family: sans-serif; line-height: 1.6;">
      <p>現場から改善報告が届きました。</p>
      <p><strong>■ 投稿日：</strong>${escapeHtml(dateOnly)}</p>
      ${baseHtml}
      <p><strong>■ 名前：</strong>${escapeHtml(displayName)}</p>
      <p><strong>■ 感情：</strong>${escapeHtml(emotionLabel)}</p>
      <p><strong>■ 内容：</strong>${escapeHtml(payload.rawText)}</p>
      <p><strong>■ AIの要約：</strong>${escapeHtml(payload.summary)}</p>
      ${imageHtml}
      <hr />
      <p style="color: #888; font-size: 12px;">※この報告は匿名で送信されています。個人情報やデバイス情報は含まれていません。</p>
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
