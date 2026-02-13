"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  onTranscript: (text: string) => void;
}

export default function VoiceInput({ onTranscript }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

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
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        onTranscript(finalTranscript);
      }
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  if (!isSupported) {
    return (
      <p className="text-sm text-gray-400 text-center">
        このブラウザでは おんせい にゅうりょく が つかえません
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={isRecording ? stopRecording : startRecording}
      className={`w-full flex flex-col items-center justify-center gap-1 py-4 rounded-2xl text-base font-bold transition-all ${
        isRecording
          ? "bg-red-500 text-white mic-recording shadow-lg shadow-red-200"
          : "bg-orange-50 text-orange-700 hover:bg-orange-100 border-2 border-orange-200"
      }`}
    >
      <span className="text-3xl" role="img" aria-label="マイク">🎤</span>
      <span className="text-sm">
        {isRecording ? "とめる" : "おんせい"}
      </span>
    </button>
  );
}
