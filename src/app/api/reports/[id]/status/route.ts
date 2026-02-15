import { NextRequest, NextResponse } from "next/server";
import { updateReportStatus, getReportById, VALID_STATUSES } from "@/db/database";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // レートリミット
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "しばらく まってね" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  // 認証
  const expected = process.env.DASHBOARD_TOKEN;
  if (!expected || expected === "change-me-to-a-random-string") {
    return NextResponse.json({ error: "サーバーの設定が必要です" }, { status: 503 });
  }

  // 認証: Cookie認証のみ許可（URLトークン認証はトークンがログ・履歴に残るため廃止）
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie || !verifySessionToken(sessionCookie, expected)) {
    return NextResponse.json({ error: "アクセスけんが ありません" }, { status: 401 });
  }

  // リクエスト解析
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが ただしくありません" }, { status: 400 });
  }

  const newStatus = body.status;
  if (!newStatus || !VALID_STATUSES.includes(newStatus as typeof VALID_STATUSES[number])) {
    return NextResponse.json(
      { error: `ステータスは ${VALID_STATUSES.join(", ")} のいずれかです` },
      { status: 400 }
    );
  }

  const report = getReportById(params.id);
  if (!report) {
    return NextResponse.json({ error: "ほうこくが みつかりません" }, { status: 404 });
  }

  const updated = updateReportStatus(params.id, newStatus as typeof VALID_STATUSES[number]);
  if (!updated) {
    return NextResponse.json({ error: "こうしんに しっぱい しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: params.id, status: newStatus });
}
