"use client";

import { useState, useEffect } from "react";
import type { Report } from "@/db/database";

const emotionEmoji: Record<string, string> = {
  red: "💢",
  yellow: "💡",
  blue: "👍",
};

const emotionLabel: Record<string, string> = {
  red: "イラッ",
  yellow: "ていあん",
  blue: "ナイス",
};

const priorityColor: Record<number, string> = {
  5: "bg-red-500",
  4: "bg-orange-500",
  3: "bg-yellow-500",
  2: "bg-blue-400",
  1: "bg-green-400",
};

export default function DashboardPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/reports")
      .then((res) => res.json())
      .then((data) => {
        setReports(data.reports || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredReports =
    filter === "all" ? reports : reports.filter((r) => r.emotion === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-500">よみこみちゅう...</div>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          📊 かいぜん ダッシュボード
        </h1>
        <a
          href="/"
          className="text-blue-500 hover:text-blue-600 text-sm font-medium"
        >
          ＋ あたらしい ほうこく
        </a>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <div className="text-3xl mb-1">💢</div>
          <div className="text-2xl font-bold text-red-600">
            {reports.filter((r) => r.emotion === "red").length}
          </div>
          <div className="text-xs text-red-500">もんだいてん</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <div className="text-3xl mb-1">💡</div>
          <div className="text-2xl font-bold text-yellow-600">
            {reports.filter((r) => r.emotion === "yellow").length}
          </div>
          <div className="text-xs text-yellow-500">ていあん</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <div className="text-3xl mb-1">👍</div>
          <div className="text-2xl font-bold text-blue-600">
            {reports.filter((r) => r.emotion === "blue").length}
          </div>
          <div className="text-xs text-blue-500">ナイス</div>
        </div>
      </div>

      {/* フィルタ */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { id: "all", label: "ぜんぶ" },
          { id: "red", label: "💢 イラッ" },
          { id: "yellow", label: "💡 ていあん" },
          { id: "blue", label: "👍 ナイス" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition ${
              filter === f.id
                ? "bg-gray-800 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* レポート一覧 */}
      {filteredReports.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          まだ ほうこくが ありません
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    {emotionEmoji[report.emotion] || "⚪"}
                  </span>
                  <span className="text-sm font-bold text-gray-600">
                    {emotionLabel[report.emotion] || report.emotion}
                  </span>
                  {report.priority && (
                    <span
                      className={`text-xs text-white px-2 py-0.5 rounded-full ${
                        priorityColor[report.priority] || "bg-gray-400"
                      }`}
                    >
                      P{report.priority}
                    </span>
                  )}
                  {report.category && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {report.category}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {report.created_at}
                </span>
              </div>

              {report.summary && (
                <p className="text-base font-medium text-gray-800 mb-1">
                  {report.summary}
                </p>
              )}

              <p className="text-sm text-gray-500 mb-2">{report.raw_text}</p>

              {report.image_path && (
                <img
                  src={report.image_path}
                  alt="添付画像"
                  className="w-full max-h-40 object-cover rounded-lg mb-2"
                />
              )}

              {report.feedback_to_user && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
                  <p className="text-sm text-green-700">
                    💬 {report.feedback_to_user}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
