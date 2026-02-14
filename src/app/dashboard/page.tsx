"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Report } from "@/db/database";
import { BASES, getBaseLabel } from "@/lib/bases";

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

const STATUS_OPTIONS = [
  { id: "new", label: "新規", color: "bg-gray-500" },
  { id: "acknowledged", label: "確認済", color: "bg-blue-500" },
  { id: "in_progress", label: "対応中", color: "bg-yellow-500" },
  { id: "resolved", label: "完了", color: "bg-green-500" },
];

const statusLabel = (s: string) => STATUS_OPTIONS.find((o) => o.id === s)?.label || s;
const statusColor = (s: string) => STATUS_OPTIONS.find((o) => o.id === s)?.color || "bg-gray-400";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-xl text-gray-500">よみこみちゅう...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenFromUrl = searchParams.get("token");

  // 認証
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginToken, setLoginToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // データ
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // フィルタ
  const [page, setPage] = useState(1);
  const [emotionFilter, setEmotionFilter] = useState("all");
  const [baseFilter, setBaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // 検索のデバウンス用
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keyword), 400);
    return () => clearTimeout(t);
  }, [keyword]);

  // フィルタ変更時にページを1に戻す
  useEffect(() => { setPage(1); }, [emotionFilter, baseFilter, statusFilter, debouncedKeyword, dateFrom, dateTo]);

  const fetchReports = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    if (emotionFilter !== "all") params.set("emotion", emotionFilter);
    if (baseFilter !== "all") params.set("base_id", baseFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedKeyword) params.set("keyword", debouncedKeyword);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);

    try {
      const res = await fetch(`/api/reports?${params.toString()}`);
      if (res.status === 401 || res.status === 503) {
        setNeedsLogin(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setReports(data.reports || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 0);
      setNeedsLogin(false);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [page, emotionFilter, baseFilter, statusFilter, debouncedKeyword, dateFrom, dateTo]);

  // URL トークンからの自動ログイン
  useEffect(() => {
    if (tokenFromUrl) {
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenFromUrl }),
      })
        .then((res) => {
          if (res.ok) {
            router.replace("/dashboard");
            fetchReports();
          } else {
            setNeedsLogin(true);
            setLoading(false);
          }
        })
        .catch(() => {
          setNeedsLogin(true);
          setLoading(false);
        });
    } else {
      fetchReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl, router]);

  // フィルタ変更で再フェッチ
  useEffect(() => {
    if (!needsLogin && !tokenFromUrl) fetchReports();
  }, [fetchReports, needsLogin, tokenFromUrl]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginToken.trim()) { setLoginError("トークンを いれてね"); return; }
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: loginToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setLoginError(data.error || "ログインに しっぱい しました");
        setLoginLoading(false);
        return;
      }
      setLoginToken("");
      await fetchReports();
    } catch {
      setLoginError("つうしんエラー。もういちど ためしてね");
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setReports([]);
    setNeedsLogin(true);
  };

  const handleStatusChange = async (reportId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/reports/${reportId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r))
        );
      }
    } catch {
      // サイレント — 次回リロードで反映
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-500">よみこみちゅう...</div>
      </div>
    );
  }

  if (needsLogin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-700 mb-2">ダッシュボード ログイン</h1>
        <p className="text-sm text-gray-500 mb-6">かんりしゃから おしえてもらった トークンを いれてね</p>
        <form onSubmit={handleLogin} className="w-full max-w-xs">
          <input
            type="password"
            value={loginToken}
            onChange={(e) => setLoginToken(e.target.value)}
            placeholder="トークンを にゅうりょく"
            className="w-full p-3 rounded-xl border-2 border-gray-200 text-base text-center focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none transition mb-3"
            autoFocus
          />
          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-2 mb-3 text-sm font-bold">
              {loginError}
            </div>
          )}
          <button
            type="submit"
            disabled={loginLoading}
            className={`w-full py-3 rounded-xl text-base font-bold text-white transition ${
              loginLoading ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {loginLoading ? "ログインちゅう..." : "ログイン"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className="max-w-2xl md:max-w-4xl mx-auto p-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">📊 かいぜん ダッシュボード</h1>
        <div className="flex items-center gap-3">
          <a href="/" className="text-blue-500 hover:text-blue-600 text-sm font-medium">
            ＋ あたらしい ほうこく
          </a>
          <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 text-xs">
            ログアウト
          </button>
        </div>
      </div>

      {/* 検索バー */}
      <div className="mb-3">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="🔍 キーワードで けんさく..."
          className="w-full p-2.5 rounded-xl border-2 border-gray-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none transition"
        />
      </div>

      {/* 日付範囲 */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-xs text-gray-500 font-bold">📅 ここから</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full p-2 rounded-lg border border-gray-200 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-bold">📅 ここまで</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full p-2 rounded-lg border border-gray-200 text-sm"
          />
        </div>
      </div>

      {/* フィルタ行: 拠点 */}
      <div className="mb-2">
        <div className="text-xs font-bold text-gray-500 mb-1">🏢 きょてん</div>
        <div className="flex flex-wrap gap-1.5">
          {[{ id: "all", label: "ぜんぶ" }, ...BASES].map((b) => (
            <button
              key={b.id}
              onClick={() => setBaseFilter(b.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
                baseFilter === b.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* フィルタ行: カテゴリ */}
      <div className="mb-2">
        <div className="text-xs font-bold text-gray-500 mb-1">😊 カテゴリ</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "all", label: "ぜんぶ" },
            { id: "red", label: "💢 イラッ" },
            { id: "yellow", label: "💡 ていあん" },
            { id: "blue", label: "👍 ナイス" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setEmotionFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
                emotionFilter === f.id ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* フィルタ行: ステータス */}
      <div className="mb-4">
        <div className="text-xs font-bold text-gray-500 mb-1">📋 ステータス</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
              statusFilter === "all" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ぜんぶ
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
                statusFilter === s.id ? `${s.color} text-white` : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 件数 */}
      <div className="text-xs text-gray-400 mb-2">
        {total > 0
          ? `${total}件中 ${(page - 1) * 20 + 1}〜${Math.min(page * 20, total)}件を表示`
          : "0件"}
      </div>

      {/* レポート一覧 */}
      {reports.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          ほうこくが みつかりません
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-1 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl">{emotionEmoji[report.emotion] || "⚪"}</span>
                  <span className="text-sm font-bold text-gray-600">
                    {emotionLabel[report.emotion] || report.emotion}
                  </span>
                  {report.base_id && (
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
                      {getBaseLabel(report.base_id)}
                    </span>
                  )}
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
                  {report.created_at?.split(" ")[0] || report.created_at}
                </span>
              </div>

              <div className="text-xs text-gray-400 mb-1">
                {report.reporter_name || "匿名（とくめい）"}
              </div>

              {report.summary && (
                <p className="text-base font-medium text-gray-800 mb-1">{report.summary}</p>
              )}

              <p className="text-sm text-gray-500 mb-2">{report.raw_text}</p>

              {report.image_path && (
                <img
                  src={report.image_path}
                  alt="添付画像"
                  loading="lazy"
                  className="w-full max-h-40 object-cover rounded-lg mb-2"
                />
              )}

              {report.feedback_to_user && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2 mb-2">
                  <p className="text-sm text-green-700">💬 {report.feedback_to_user}</p>
                </div>
              )}

              {/* ステータス変更 */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <span className={`text-xs text-white px-2 py-0.5 rounded-full ${statusColor(report.status)}`}>
                  {statusLabel(report.status)}
                </span>
                <select
                  value={report.status}
                  onChange={(e) => handleStatusChange(report.id, e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 mb-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← まえ
          </button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            つぎ →
          </button>
        </div>
      )}
    </main>
  );
}
