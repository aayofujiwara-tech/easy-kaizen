import crypto from "crypto";

const windowMs = 60 * 1000; // 1分間
const maxRequests = 10; // 1分あたり最大10リクエスト

// 匿名性担保: IPアドレスを一方向ハッシュ化し、元のIPを保持しない
const HASH_SALT = crypto.randomBytes(16).toString("hex");

function anonymizeKey(ip: string): string {
  return crypto.createHash("sha256").update(HASH_SALT + ip).digest("hex").slice(0, 16);
}

const requests: Record<string, number[]> = {};

// 古いエントリを定期的にクリーンアップ
setInterval(() => {
  const now = Date.now();
  const keys = Object.keys(requests);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const timestamps = requests[key];
    const valid = timestamps.filter((t: number) => now - t < windowMs);
    if (valid.length === 0) {
      delete requests[key];
    } else {
      requests[key] = valid;
    }
  }
}, 60 * 1000);

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  // 匿名性担保: 生のIPアドレスではなくハッシュ値で管理
  const key = anonymizeKey(ip);
  const now = Date.now();
  const timestamps = requests[key] || [];
  const valid = timestamps.filter((t: number) => now - t < windowMs);

  if (valid.length >= maxRequests) {
    const oldest = valid[0];
    return { allowed: false, retryAfterMs: windowMs - (now - oldest) };
  }

  valid.push(now);
  requests[key] = valid;
  return { allowed: true };
}
