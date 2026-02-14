import { NextRequest, NextResponse } from "next/server";
import { getAllReports } from "@/db/database";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.DASHBOARD_TOKEN;

  if (!expected || expected === "change-me-to-a-random-string") {
    console.warn("[Reports] DASHBOARD_TOKEN が未設定です");
    return NextResponse.json(
      { error: "サーバーの設定が必要です" },
      { status: 503 }
    );
  }

  if (token !== expected) {
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
