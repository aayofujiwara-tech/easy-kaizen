import { NextRequest, NextResponse } from "next/server";
import { queryReportsForExport } from "@/db/database";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getBaseLabel } from "@/lib/bases";

export const dynamic = "force-dynamic";

const EMOTION_LABELS: Record<string, string> = {
  red: "イラッ（問題点）",
  yellow: "提案・アイデア",
  blue: "ナイス（良いこと）",
};

const STATUS_LABELS: Record<string, string> = {
  new: "新規",
  acknowledged: "確認済",
  in_progress: "対応中",
  resolved: "完了",
};

function escapeCsvField(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** CSVエクスポートAPI（認証必須） */
export async function GET(req: NextRequest) {
  const expected = process.env.DASHBOARD_TOKEN;
  if (!expected || expected === "change-me-to-a-random-string") {
    return NextResponse.json({ error: "サーバーの設定が必要です" }, { status: 503 });
  }

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie || !verifySessionToken(sessionCookie, expected)) {
    return NextResponse.json({ error: "アクセスけんが ありません" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;

  try {
    const reports = queryReportsForExport({
      emotion: sp.get("emotion") || undefined,
      base_id: sp.get("base_id") || undefined,
      status: sp.get("status") || undefined,
      keyword: sp.get("keyword") || undefined,
      date_from: sp.get("date_from") || undefined,
      date_to: sp.get("date_to") || undefined,
    });

    const BOM = "\uFEFF";
    const header = "日付,拠点,感情,カテゴリ,優先度,ステータス,名前,内容,AI要約";
    const rows = reports.map((r) => {
      return [
        r.created_at || "",
        getBaseLabel(r.base_id) || "",
        EMOTION_LABELS[r.emotion] || r.emotion,
        r.category || "",
        r.priority != null ? String(r.priority) : "",
        STATUS_LABELS[r.status] || r.status,
        r.reporter_name || "匿名（とくめい）",
        r.raw_text || "",
        r.summary || "",
      ]
        .map(escapeCsvField)
        .join(",");
    });

    const csv = BOM + [header, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kaizen-reports-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("[Export] error:", error);
    return NextResponse.json({ error: "エクスポートに しっぱい しました" }, { status: 500 });
  }
}
