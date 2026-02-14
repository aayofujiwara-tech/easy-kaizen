import { NextRequest, NextResponse } from "next/server";
import { queryReports } from "@/db/database";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // レートリミット
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    console.warn("[Reports] レートリミット超過");
    return NextResponse.json(
      { error: "しばらく まってから もういちど ためしてね" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  // 認証
  const expected = process.env.DASHBOARD_TOKEN;
  if (!expected || expected === "change-me-to-a-random-string") {
    console.warn("[Reports] DASHBOARD_TOKEN が未設定です");
    return NextResponse.json({ error: "サーバーの設定が必要です" }, { status: 503 });
  }

  let authenticated = false;

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    authenticated = verifySessionToken(sessionCookie, expected);
    if (!authenticated) {
      console.warn("[Reports] 無効なセッションCookie（期限切れまたは改ざん）");
    }
  }

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
    return NextResponse.json({ error: "アクセスけんが ありません" }, { status: 401 });
  }

  // クエリパラメータ
  const sp = req.nextUrl.searchParams;
  const page = parseInt(sp.get("page") || "1", 10);
  const limit = parseInt(sp.get("limit") || "20", 10);
  const emotion = sp.get("emotion") || undefined;
  const base_id = sp.get("base_id") || undefined;
  const status = sp.get("status") || undefined;
  const keyword = sp.get("keyword") || undefined;
  const date_from = sp.get("date_from") || undefined;
  const date_to = sp.get("date_to") || undefined;

  try {
    const result = queryReports({ page, limit, emotion, base_id, status, keyword, date_from, date_to });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Reports fetch error:", error);
    return NextResponse.json(
      { error: "データの よみこみに しっぱい しました" },
      { status: 500 }
    );
  }
}
