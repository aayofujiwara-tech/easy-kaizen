import { NextRequest, NextResponse } from "next/server";
import { queryBoardReports } from "@/db/database";
import { BASE_MAP } from "@/lib/bases";

export const dynamic = "force-dynamic";

/** 対応状況ボード用API（認証不要・公開情報のみ） */
export async function GET(req: NextRequest) {
  const baseId = req.nextUrl.searchParams.get("base") || "";

  if (!baseId || !BASE_MAP[baseId]) {
    return NextResponse.json(
      { error: "きょてんが ただしくありません" },
      { status: 400 }
    );
  }

  try {
    const reports = queryBoardReports(baseId);
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("[Board] fetch error:", error);
    return NextResponse.json(
      { error: "よみこみに しっぱい しました" },
      { status: 500 }
    );
  }
}
