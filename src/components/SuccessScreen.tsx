"use client";

interface Props {
  feedback: string;
  onReset: () => void;
}

export default function SuccessScreen({ feedback, onReset }: Props) {
  return (
    <div className="fade-in-up flex flex-col items-center justify-center py-16 sm:py-24 text-center px-6">
      <div className="text-6xl mb-6">🎉</div>
      <h2 className="text-2xl font-bold text-green-600 mb-4">
        しつちょうに とどけました！
      </h2>
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 mb-8 max-w-sm">
        <p className="text-lg text-green-800 leading-relaxed">{feedback}</p>
      </div>
      <button
        onClick={onReset}
        className="bg-gray-800 text-white px-8 py-4 rounded-2xl text-lg font-bold hover:bg-gray-700 transition"
      >
        もういちど ほうこくする
      </button>
    </div>
  );
}
