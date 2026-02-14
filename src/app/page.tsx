"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import EmotionSelector from "@/components/EmotionSelector";
import VoiceInput from "@/components/VoiceInput";
import ImageUpload from "@/components/ImageUpload";
import SuccessScreen from "@/components/SuccessScreen";
import { BASES } from "@/lib/bases";

type SubmitState = "idle" | "submitting" | "success";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-xl text-gray-500">よみこみちゅう...</div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const baseFromUrl = searchParams.get("base") || "";
  const validBaseFromUrl = BASES.some((b) => b.id === baseFromUrl)
    ? baseFromUrl
    : "";

  const [baseId, setBaseId] = useState(validBaseFromUrl);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const selectedBase = BASES.find((b) => b.id === baseId);
  const isBaseLocked = !!validBaseFromUrl;

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setText((prev) => (prev ? prev + " " + transcript : transcript));
  }, []);

  const handleSubmit = async () => {
    if (!baseId) {
      setError("きょてんを えらんでね！");
      return;
    }
    if (!emotion) {
      setError("きもちを えらんでね！");
      return;
    }
    if (!text.trim()) {
      setError("なにか かいてね！");
      return;
    }

    setError("");
    setSubmitState("submitting");

    try {
      const formData = new FormData();
      formData.append("emotion", emotion);
      formData.append("text", text);
      formData.append("base_id", baseId);
      formData.append("reporter_name", reporterName);
      if (image) {
        formData.append("image", image);
      }

      const res = await fetch("/api/submit", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("そうしんに しっぱい しました");
      }

      const data = await res.json();
      setFeedback(
        data.feedback_to_user ||
          "ほうこく ありがとう！げんばの こえを とどけてくれて うれしいです！"
      );
      setSubmitState("success");
    } catch {
      setError("そうしんに しっぱい しました。もういちど ためしてね。");
      setSubmitState("idle");
    }
  };

  const handleReset = () => {
    setEmotion(null);
    setText("");
    setReporterName("");
    setImage(null);
    setSubmitState("idle");
    setFeedback("");
    setError("");
  };

  if (submitState === "success") {
    return (
      <main className="max-w-lg mx-auto p-4">
        <SuccessScreen feedback={feedback} onReset={handleReset} />
      </main>
    );
  }

  return (
    <main className="max-w-lg mx-auto p-4 pb-24">
      {/* ヘッダー */}
      <div className="text-center mb-4 pt-2">
        <h1 className="text-2xl font-bold text-gray-800">
          📋 かいぜん ほうこく
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          きづいたことを おしえてね
        </p>
      </div>

      {/* 拠点表示・選択 */}
      <section className="mb-4">
        {isBaseLocked ? (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-center">
            <span className="text-sm text-indigo-600 font-bold">
              🏢 {selectedBase?.label}から ほうこくしています
            </span>
          </div>
        ) : (
          <>
            <h2 className="text-base font-bold text-gray-700 mb-2">
              🏢 きょてんを えらんでね
            </h2>
            <select
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-gray-200 text-base font-bold text-gray-700 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none transition"
            >
              <option value="">-- えらんでね --</option>
              {BASES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </>
        )}
      </section>

      {/* ステップ1: 感情選択 */}
      <section className="mb-4">
        <h2 className="text-base font-bold text-gray-700 mb-2">
          ① いまの きもちは？
        </h2>
        <EmotionSelector selected={emotion} onSelect={setEmotion} />
      </section>

      {/* ステップ2: テキスト入力 */}
      <section className="mb-4">
        <h2 className="text-base font-bold text-gray-700 mb-2">
          ② くわしく おしえてね
        </h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここに かいてね... おんせいでも OK！"
          rows={3}
          className="w-full p-3 rounded-xl border-2 border-gray-200 text-base focus:border-blue-400 focus:ring-2 focus:ring-blue-200 outline-none resize-none transition"
        />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <VoiceInput onTranscript={handleVoiceTranscript} />
          <ImageUpload onImageSelect={setImage} />
        </div>
      </section>

      {/* ステップ3: 名前（任意） */}
      <section className="mb-4">
        <h2 className="text-base font-bold text-gray-700 mb-2">
          ③ なまえ（にゅうりょく しなくても OK！）
        </h2>
        <input
          type="text"
          value={reporterName}
          onChange={(e) => setReporterName(e.target.value)}
          placeholder="とくめいで おくれるよ"
          className="w-full p-3 rounded-xl border-2 border-gray-200 text-base focus:border-blue-400 focus:ring-2 focus:ring-blue-200 outline-none transition"
        />
        <p className="text-xs text-gray-400 mt-1">
          いれなければ「とくめい」で おくられます
        </p>
      </section>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-3 text-center font-bold">
          {error}
        </div>
      )}

      {/* 送信ボタン */}
      <button
        onClick={handleSubmit}
        disabled={submitState === "submitting"}
        className={`w-full py-4 rounded-2xl text-xl font-bold text-white transition-all ${
          submitState === "submitting"
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-green-500 hover:bg-green-600 active:scale-98 shadow-lg shadow-green-200"
        }`}
      >
        {submitState === "submitting" ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            おくってるよ...
          </span>
        ) : (
          "✉️ しつちょうに とどける！"
        )}
      </button>

      {/* プライバシー・ステートメント */}
      <p className="text-xs text-gray-400 text-center mt-3 leading-relaxed">
        ※この報告は匿名（とくめい）で送られ、あなたの個人情報やデバイス情報が室長に伝わることはありません。
      </p>
    </main>
  );
}
