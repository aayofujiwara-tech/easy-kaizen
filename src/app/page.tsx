"use client";

import { useState, useCallback } from "react";
import EmotionSelector from "@/components/EmotionSelector";
import VoiceInput from "@/components/VoiceInput";
import ImageUpload from "@/components/ImageUpload";
import SuccessScreen from "@/components/SuccessScreen";

type SubmitState = "idle" | "submitting" | "success";

export default function Home() {
  const [emotion, setEmotion] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setText((prev) => (prev ? prev + " " + transcript : transcript));
  }, []);

  const handleSubmit = async () => {
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
      <div className="text-center mb-6 pt-2">
        <h1 className="text-2xl font-bold text-gray-800">
          📋 かいぜん ほうこく
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          きづいたことを おしえてね
        </p>
      </div>

      {/* ステップ1: 感情選択 */}
      <section className="mb-6">
        <h2 className="text-base font-bold text-gray-700 mb-3">
          ① いまの きもちは？
        </h2>
        <EmotionSelector selected={emotion} onSelect={setEmotion} />
      </section>

      {/* ステップ2: テキスト入力 */}
      <section className="mb-6">
        <h2 className="text-base font-bold text-gray-700 mb-3">
          ② くわしく おしえてね
        </h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここに かいてね... おんせいでも OK！"
          rows={4}
          className="w-full p-4 rounded-xl border-2 border-gray-200 text-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-200 outline-none resize-none transition"
        />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <VoiceInput onTranscript={handleVoiceTranscript} />
          <ImageUpload onImageSelect={setImage} />
        </div>
      </section>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-center font-bold">
          {error}
        </div>
      )}

      {/* 送信ボタン */}
      <button
        onClick={handleSubmit}
        disabled={submitState === "submitting"}
        className={`w-full py-5 rounded-2xl text-xl font-bold text-white transition-all ${
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
    </main>
  );
}
