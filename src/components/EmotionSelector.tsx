"use client";

interface EmotionOption {
  id: string;
  emoji: string;
  label: string;
  color: string;
  bgColor: string;
  ringColor: string;
}

const emotions: EmotionOption[] = [
  {
    id: "red",
    emoji: "🔴",
    label: "イラッ",
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-200",
    ringColor: "ring-red-400",
  },
  {
    id: "yellow",
    emoji: "🟡",
    label: "ていあん",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50 border-yellow-200",
    ringColor: "ring-yellow-400",
  },
  {
    id: "blue",
    emoji: "🔵",
    label: "ナイス！",
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
    ringColor: "ring-blue-400",
  },
];

interface Props {
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function EmotionSelector({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {emotions.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onSelect(e.id)}
          className={`emotion-btn border-2 ${e.bgColor} ${
            selected === e.id ? `selected ${e.ringColor}` : ""
          }`}
        >
          <span className="text-4xl mb-1">{e.emoji}</span>
          <span className={`text-base font-bold ${e.color}`}>{e.label}</span>
        </button>
      ))}
    </div>
  );
}
