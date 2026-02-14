import { NextRequest, NextResponse } from "next/server";
import { getReportStats } from "@/db/database";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 集計API（認証必須） */
export async function GET(req: NextRequest) {
  const expected = process.env.DASHBOARD_TOKEN;
  if (!expected || expected === "change-me-to-a-random-string") {
    return NextResponse.json({ error: "サーバーの設定が必要です" }, { status: 503 });
  }

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie || !verifySessionToken(sessionCookie, expected)) {
    return NextResponse.json({ error: "アクセスけんが ありません" }, { status: 401 });
  }

  try {
    const stats = getReportStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[Stats] fetch error:", error);
    return NextResponse.json({ error: "集計に しっぱい しました" }, { status: 500 });
  }
}
