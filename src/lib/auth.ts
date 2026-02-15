import crypto from "crypto";

const SESSION_MAX_AGE = 24 * 60 * 60; // 24時間（秒）

/**
 * ダッシュボード用のステートレスなセッショントークンを生成する
 * 形式: timestamp.nonce.HMAC-SHA256(DASHBOARD_TOKEN, timestamp.nonce)
 * サーバーレス環境（Vercel等）で動作するようステートレスに設計
 * nonce によりログインごとに異なるトークンを生成（セッション固定攻撃防止）
 */
export function createSessionToken(dashboardToken: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${timestamp}.${nonce}`;
  const hmac = crypto
    .createHmac("sha256", dashboardToken)
    .update(payload)
    .digest("hex");
  return `${payload}.${hmac}`;
}

/**
 * セッショントークンを検証する
 * - HMAC署名の一致確認
 * - 有効期限（24時間）の確認
 * 形式: timestamp.nonce.hmac
 */
export function verifySessionToken(
  sessionToken: string,
  dashboardToken: string
): boolean {
  const parts = sessionToken.split(".");
  if (parts.length !== 3) return false;

  const [timestamp, nonce, providedHmac] = parts;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  if (!nonce || nonce.length !== 32) return false;

  // 有効期限チェック
  const now = Math.floor(Date.now() / 1000);
  if (now - ts > SESSION_MAX_AGE) return false;

  // HMAC検証（タイミング攻撃対策にtimingSafeEqualを使用）
  const payload = `${timestamp}.${nonce}`;
  const expectedHmac = crypto
    .createHmac("sha256", dashboardToken)
    .update(payload)
    .digest("hex");

  if (providedHmac.length !== expectedHmac.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(providedHmac, "hex"),
    Buffer.from(expectedHmac, "hex")
  );
}

export const SESSION_COOKIE_NAME = "kaizen_session";
export { SESSION_MAX_AGE };
