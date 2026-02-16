import crypto from "crypto";

const windowMs = 60 * 1000; // 1分間
const maxRequests = 10; // 1分あたり最大10リクエスト

// 匿名性担保: IPアドレスを一方向ハッシュ化し、元のIPを保持しない
const HASH_SALT = crypto.randomBytes(16).toString("hex");

function anonymizeKey(ip: string): string {
  return crypto.createHash("sha256").update(HASH_SALT + ip).digest("hex").slice(0, 16);
}

// メモリ保護: エントリ数の上限（大量の異なるIPからのアクセスによるメモリ枯渇を防止）
const MAX_ENTRIES = 10_000;

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

/** エントリ数が上限を超えた場合、最も古いエントリから削除する */
function evictOldestEntries(store: Record<string, number[]>, maxEntries: number): void {
  const keys = Object.keys(store);
  if (keys.length <= maxEntries) return;
  // 各キーの最新タイムスタンプでソートし、古いものから削除
  const sorted = keys
    .map((k) => ({ key: k, latest: Math.max(...store[k]) }))
    .sort((a, b) => a.latest - b.latest);
  const toRemove = sorted.length - maxEntries;
  for (let i = 0; i < toRemove; i++) {
    delete store[sorted[i].key];
  }
}

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
  evictOldestEntries(requests, MAX_ENTRIES);
  return { allowed: true };
}

// ===== 投稿専用の厳格なレートリミット =====
// スパム攻撃対策: 投稿APIにはより厳しい制限を適用
// - 1分あたり3件まで（通常利用では十分）
// - IP偽装によるバイパスを困難にするため、グローバルリミットも併用
const submitWindowMs = 60 * 1000;
const maxSubmitPerIp = 3;       // IPあたり1分3件
const maxSubmitGlobal = 30;     // サーバー全体で1分30件（複数IP使用のスパム対策）
const submitRequests: Record<string, number[]> = {};
let globalSubmitTimestamps: number[] = [];

setInterval(() => {
  const now = Date.now();
  const keys = Object.keys(submitRequests);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const valid = submitRequests[key].filter((t: number) => now - t < submitWindowMs);
    if (valid.length === 0) {
      delete submitRequests[key];
    } else {
      submitRequests[key] = valid;
    }
  }
  globalSubmitTimestamps = globalSubmitTimestamps.filter((t) => now - t < submitWindowMs);
}, 60 * 1000);

export function checkSubmitRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const key = anonymizeKey(ip);
  const now = Date.now();

  // グローバルリミットチェック（複数IP使用のスパム対策）
  globalSubmitTimestamps = globalSubmitTimestamps.filter((t) => now - t < submitWindowMs);
  if (globalSubmitTimestamps.length >= maxSubmitGlobal) {
    // 拒否されたリクエストもカウント（次のウィンドウまで即座に再攻撃できないようにする）
    globalSubmitTimestamps.push(now);
    return { allowed: false, retryAfterMs: submitWindowMs - (now - globalSubmitTimestamps[0]) };
  }

  // IPごとのリミットチェック
  const timestamps = submitRequests[key] || [];
  const valid = timestamps.filter((t: number) => now - t < submitWindowMs);
  if (valid.length >= maxSubmitPerIp) {
    // 拒否されたリクエストもカウント
    valid.push(now);
    submitRequests[key] = valid;
    const oldest = valid[0];
    return { allowed: false, retryAfterMs: submitWindowMs - (now - oldest) };
  }

  valid.push(now);
  submitRequests[key] = valid;
  globalSubmitTimestamps.push(now);
  evictOldestEntries(submitRequests, MAX_ENTRIES);
  return { allowed: true };
}
