import { NextResponse } from "next/server";
import { getAllReports } from "@/db/database";

export const dynamic = "force-dynamic";

export async function GET() {
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
