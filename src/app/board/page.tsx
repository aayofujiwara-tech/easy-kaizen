"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BASES, getBaseLabel } from "@/lib/bases";

interface BoardReport {
  id: string;
  emotion: string;
  summary: string | null;
  category: string | null;
  priority: number | null;
  status: string;
  created_at: string;
}

const emotionEmoji: Record<string, string> = {
  red: "💢",
  yellow: "💡",
  blue: "👍",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "新規", color: "text-gray-700", bg: "bg-gray-100" },
  acknowledged: { label: "確認済", color: "text-blue-700", bg: "bg-blue-50" },
  in_progress: { label: "対応中", color: "text-yellow-700", bg: "bg-yellow-50" },
  resolved: { label: "完了", color: "text-green-700", bg: "bg-green-50" },
};

export default function BoardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-xl text-gray-500">よみこみちゅう...</div>
        </div>
      }
    >
      <BoardContent />
    </Suspense>
  );
}

function BoardContent() {
  const searchParams = useSearchParams();
  const baseFromUrl = searchParams.get("base") || "";

  const [baseId, setBaseId] = useState(baseFromUrl);
  const [reports, setReports] = useState<BoardReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isBaseLocked = !!baseFromUrl;

  useEffect(() => {
    if (!baseId) return;
    setLoading(true);
    setError("");
    fetch(`/api/board?base=${encodeURIComponent(baseId)}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => {
        setReports(data.reports || []);
        setLoading(false);
      })
      .catch(() => {
        setError("よみこみに しっぱい しました");
        setLoading(false);
      });
  }, [baseId]);

  const statusCounts = {
    new: reports.filter((r) => r.status === "new").length,
    acknowledged: reports.filter((r) => r.status === "acknowledged").length,
    in_progress: reports.filter((r) => r.status === "in_progress").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };

  return (
    <main className="max-w-lg mx-auto p-4 pb-12">
      {/* ヘッダー */}
      <div className="text-center mb-4 pt-2">
        <h1 className="text-2xl font-bold text-gray-800">📋 たいおう じょうきょう</h1>
        <p className="text-sm text-gray-500 mt-1">
          みんなの こえが どうなったか みてみよう
        </p>
      </div>

      {/* 拠点選択 */}
      <section className="mb-4">
        {isBaseLocked ? (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-center">
            <span className="text-sm text-indigo-600 font-bold">
              🏢 {getBaseLabel(baseId)}の たいおう じょうきょう
            </span>
          </div>
        ) : (
          <select
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            className="w-full p-3 rounded-xl border-2 border-gray-200 text-base font-bold text-gray-700 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none transition"
          >
            <option value="">-- きょてんを えらんでね --</option>
            {BASES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        )}
      </section>

      {!baseId && (
        <div className="text-center text-gray-400 py-12">
          きょてんを えらぶと じょうきょうが みれるよ
        </div>
      )}

      {loading && (
        <div className="text-center text-gray-400 py-12">
          よみこみちゅう...
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-3 text-center font-bold">
          {error}
        </div>
      )}

      {baseId && !loading && !error && (
        <>
          {/* ステータスサマリー */}
          <section className="grid grid-cols-4 gap-2 mb-4">
            {(["new", "acknowledged", "in_progress", "resolved"] as const).map((s) => {
              const cfg = STATUS_CONFIG[s];
              return (
                <div key={s} className={`${cfg.bg} rounded-xl p-3 text-center`}>
                  <div className={`text-2xl font-bold ${cfg.color}`}>
                    {statusCounts[s]}
                  </div>
                  <div className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</div>
                </div>
              );
            })}
          </section>

          {/* レポート一覧 */}
          {reports.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              まだ ほうこくが ありません
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => {
                const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.new;
                return (
                  <div
                    key={report.id}
                    className={`${cfg.bg} rounded-xl border border-gray-200 p-3`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {emotionEmoji[report.emotion] || "⚪"}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.color} bg-white`}>
                          {cfg.label}
                        </span>
                        {report.category && (
                          <span className="text-xs text-gray-500">
                            {report.category}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {report.created_at}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">
                      {report.summary || "（ようやく じゅんびちゅう）"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* プライバシーノート */}
          <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed">
            ※このページでは AI要約のみ表示しています。投稿の詳細や個人情報は表示されません。
          </p>

          {/* 投稿リンク */}
          <div className="text-center mt-4">
            <a
              href={`/?base=${baseId}`}
              className="inline-block px-6 py-3 bg-green-500 text-white font-bold rounded-2xl shadow hover:bg-green-600 transition"
            >
              ✉️ じぶんも ほうこくする
            </a>
          </div>
        </>
      )}
    </main>
  );
}
