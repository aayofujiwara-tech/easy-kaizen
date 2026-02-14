import crypto from "crypto";

const SESSION_MAX_AGE = 24 * 60 * 60; // 24時間（秒）

/**
 * ダッシュボード用のステートレスなセッショントークンを生成する
 * 形式: timestamp.HMAC-SHA256(DASHBOARD_TOKEN, timestamp)
 * サーバーレス環境（Vercel等）で動作するようステートレスに設計
 */
export function createSessionToken(dashboardToken: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = crypto
    .createHmac("sha256", dashboardToken)
    .update(timestamp)
    .digest("hex");
  return `${timestamp}.${hmac}`;
}

/**
 * セッショントークンを検証する
 * - HMAC署名の一致確認
 * - 有効期限（24時間）の確認
 */
export function verifySessionToken(
  sessionToken: string,
  dashboardToken: string
): boolean {
  const parts = sessionToken.split(".");
  if (parts.length !== 2) return false;

  const [timestamp, providedHmac] = parts;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  // 有効期限チェック
  const now = Math.floor(Date.now() / 1000);
  if (now - ts > SESSION_MAX_AGE) return false;

  // HMAC検証（タイミング攻撃対策にtimingSafeEqualを使用）
  const expectedHmac = crypto
    .createHmac("sha256", dashboardToken)
    .update(timestamp)
    .digest("hex");

  if (providedHmac.length !== expectedHmac.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(providedHmac, "hex"),
    Buffer.from(expectedHmac, "hex")
  );
}

export const SESSION_COOKIE_NAME = "kaizen_session";
export { SESSION_MAX_AGE };
