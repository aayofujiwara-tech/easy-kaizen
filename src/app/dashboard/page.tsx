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

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginToken, setLoginToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [emotionFilter, setEmotionFilter] = useState<string>("all");
  const [baseFilter, setBaseFilter] = useState<string>("all");

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/reports");
      if (res.status === 401 || res.status === 503) {
        setNeedsLogin(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setReports(data.reports || []);
      setNeedsLogin(false);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  // URLトークンがある場合は自動ログインしてURLからトークンを消去
  useEffect(() => {
    if (tokenFromUrl) {
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenFromUrl }),
      })
        .then((res) => {
          if (res.ok) {
            // ログイン成功: URLからトークンを消去（ブラウザ履歴にトークンを残さない）
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
      // Cookie認証を試みる
      fetchReports();
    }
  }, [tokenFromUrl, router, fetchReports]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginToken.trim()) {
      setLoginError("トークンを いれてね");
      return;
    }

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

      // ログイン成功: Cookie設定済み → レポートを取得
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

  const filteredReports = reports.filter((r) => {
    const emotionMatch = emotionFilter === "all" || r.emotion === emotionFilter;
    const baseMatch = baseFilter === "all" || r.base_id === baseFilter;
    return emotionMatch && baseMatch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-500">よみこみちゅう...</div>
      </div>
    );
  }

  // ログイン画面
  if (needsLogin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-700 mb-2">
          ダッシュボード ログイン
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          かんりしゃから おしえてもらった トークンを いれてね
        </p>
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
              loginLoading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700"
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          📊 かいぜん ダッシュボード
        </h1>
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="text-blue-500 hover:text-blue-600 text-sm font-medium"
          >
            ＋ あたらしい ほうこく
          </a>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-600 text-xs"
          >
            ログアウト
          </button>
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <div className="text-2xl mb-1">💢</div>
          <div className="text-2xl font-bold text-red-600">
            {reports.filter((r) => r.emotion === "red").length}
          </div>
          <div className="text-xs text-red-500">もんだいてん</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
          <div className="text-2xl mb-1">💡</div>
          <div className="text-2xl font-bold text-yellow-600">
            {reports.filter((r) => r.emotion === "yellow").length}
          </div>
          <div className="text-xs text-yellow-500">ていあん</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <div className="text-2xl mb-1">👍</div>
          <div className="text-2xl font-bold text-blue-600">
            {reports.filter((r) => r.emotion === "blue").length}
          </div>
          <div className="text-xs text-blue-500">ナイス</div>
        </div>
      </div>

      {/* 拠点フィルタ */}
      <div className="mb-2">
        <div className="text-xs font-bold text-gray-500 mb-1">🏢 きょてん</div>
        <div className="flex flex-wrap gap-2">
          {[{ id: "all", label: "ぜんぶ" }, ...BASES].map((b) => (
            <button
              key={b.id}
              onClick={() => setBaseFilter(b.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-bold transition ${
                baseFilter === b.id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* カテゴリフィルタ */}
      <div className="mb-4">
        <div className="text-xs font-bold text-gray-500 mb-1">😊 カテゴリ</div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "ぜんぶ" },
            { id: "red", label: "💢 イラッ" },
            { id: "yellow", label: "💡 ていあん" },
            { id: "blue", label: "👍 ナイス" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setEmotionFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-bold transition ${
                emotionFilter === f.id
                  ? "bg-gray-800 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
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
              <div className="flex flex-wrap items-start justify-between gap-1 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl">
                    {emotionEmoji[report.emotion] || "⚪"}
                  </span>
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

              {/* 名前: 未入力時は「匿名」と表示 */}
              <div className="text-xs text-gray-400 mb-1">
                {report.reporter_name || "匿名（とくめい）"}
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
                  loading="lazy"
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
