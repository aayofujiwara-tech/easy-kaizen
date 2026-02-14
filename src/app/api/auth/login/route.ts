import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  // ブルートフォース対策: ログイン試行にもレートリミットを適用
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    console.warn("[Auth] レートリミット超過によるログイン拒否");
    return NextResponse.json(
      { error: "しばらく まってから もういちど ためしてね" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)
          ),
        },
      }
    );
  }

  const expected = process.env.DASHBOARD_TOKEN;
  if (!expected || expected === "change-me-to-a-random-string") {
    console.warn("[Auth] DASHBOARD_TOKEN が未設定です");
    return NextResponse.json(
      { error: "サーバーの設定が必要です" },
      { status: 503 }
    );
  }

  let token: string;
  try {
    const body = await req.json();
    token = body.token;
  } catch {
    return NextResponse.json(
      { error: "トークンを入力してね" },
      { status: 400 }
    );
  }

  if (!token || token !== expected) {
    console.warn("[Auth] ログイン失敗: 無効なトークン");
    return NextResponse.json(
      { error: "トークンが ちがうよ" },
      { status: 401 }
    );
  }

  // ログイン成功: HttpOnly Cookie にセッショントークンをセット
  console.log("[Auth] ログイン成功");
  const sessionToken = createSessionToken(expected);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return response;
}
