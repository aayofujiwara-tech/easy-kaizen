"use client";
import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  onTranscript: (text: string) => void;
}

export default function VoiceInput({ onTranscript }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [status, setStatus] = useState<string>("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  // 最新の onTranscript を ref に保持（再生成を防ぐ）
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const startRecording = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = false; // final のみ受け取る（安定性向上）
    recognition.continuous = true;      // 「とめる」を押すまで聞き続ける

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript) {
        console.log("[Voice] 認識結果:", transcript);
        setStatus("");
        onTranscriptRef.current(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("[Voice] エラー:", event.error, event.message);
      // ユーザーに分かる形でステータス表示
      switch (event.error) {
        case "no-speech":
          setStatus("こえが きこえませんでした");
          break;
        case "audio-capture":
          setStatus("マイクが みつかりません");
          break;
        case "not-allowed":
          setStatus("マイクの きょかが ひつようです");
          break;
        default:
          setStatus(`エラー: ${event.error}`);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      console.log("[Voice] 終了");
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsRecording(true);
      setStatus("きいています...");
      console.log("[Voice] 録音開始");
    } catch (e) {
      console.error("[Voice] start() 失敗:", e);
      setStatus("かいし できませんでした");
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setStatus("");
  }, []);

  if (!isSupported) {
    return (
      <p className="text-sm text-gray-400 text-center">
        このブラウザでは おんせい にゅうりょく が つかえません
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        className={`w-full flex flex-col items-center justify-center gap-1 py-4 rounded-2xl text-base font-bold transition-all ${
          isRecording
            ? "bg-red-500 text-white mic-recording shadow-lg shadow-red-200"
            : "bg-orange-50 text-orange-700 hover:bg-orange-100 border-2 border-orange-200"
        }`}
      >
        <span className="text-3xl" role="img" aria-label="マイク">
          🎤
        </span>
        <span className="text-sm">
          {isRecording ? "とめる" : "おんせい"}
        </span>
      </button>
      {status && (
        <p className="text-xs text-gray-500 mt-1">{status}</p>
      )}
    </div>
  );
}
