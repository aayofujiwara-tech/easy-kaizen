import { NextRequest, NextResponse } from "next/server";
import { getAllReports } from "@/db/database";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // レートリミット: ダッシュボードAPIへのDoS・ブルートフォース対策
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    console.warn("[Reports] レートリミット超過");
    return NextResponse.json(
      { error: "しばらく まってから もういちど ためしてね" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const expected = process.env.DASHBOARD_TOKEN;
  if (!expected || expected === "change-me-to-a-random-string") {
    console.warn("[Reports] DASHBOARD_TOKEN が未設定です");
    return NextResponse.json(
      { error: "サーバーの設定が必要です" },
      { status: 503 }
    );
  }

  // 認証: Cookie（優先） または URLトークン（後方互換）
  let authenticated = false;

  // 1. HttpOnly Cookie による認証（推奨）
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    authenticated = verifySessionToken(sessionCookie, expected);
    if (!authenticated) {
      console.warn("[Reports] 無効なセッションCookie（期限切れまたは改ざん）");
    }
  }

  // 2. URLトークンによる認証（後方互換 — 初回ログインへのリダイレクト用）
  if (!authenticated) {
    const token = req.nextUrl.searchParams.get("token");
    if (token && token === expected) {
      authenticated = true;
    } else if (token) {
      console.warn("[Reports] 無効なURLトークンによるアクセス試行");
    }
  }

  if (!authenticated) {
    console.warn("[Reports] 認証失敗: アクセス拒否");
    return NextResponse.json(
      { error: "アクセスけんが ありません" },
      { status: 401 }
    );
  }

  try {
    const reports = getAllReports();
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("Reports fetch error:", error);
    return NextResponse.json(
      { error: "データの よみこみに しっぱい しました" },
      { status: 500 }
    );
  }
}
