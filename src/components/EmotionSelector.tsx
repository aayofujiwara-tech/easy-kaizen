"use client";

interface EmotionOption {
  id: string;
  emoji: string;
  label: string;
  sublabel: string;
  color: string;
  bgColor: string;
  ringColor: string;
}

const emotions: EmotionOption[] = [
  {
    id: "red",
    emoji: "💢",
    label: "イラッ",
    sublabel: "もんだいてん",
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-300",
    ringColor: "ring-red-400",
  },
  {
    id: "yellow",
    emoji: "💡",
    label: "ていあん",
    sublabel: "アイデア",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50 border-yellow-300",
    ringColor: "ring-yellow-400",
  },
  {
    id: "blue",
    emoji: "👍",
    label: "ナイス！",
    sublabel: "いいこと",
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-300",
    ringColor: "ring-blue-400",
  },
];

interface Props {
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function EmotionSelector({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {emotions.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onSelect(e.id)}
          className={`emotion-btn border-2 ${e.bgColor} ${
            selected === e.id ? `selected ${e.ringColor}` : ""
          }`}
        >
          <span className="text-5xl mb-2" role="img" aria-label={e.label}>
            {e.emoji}
          </span>
          <span className={`text-base font-bold ${e.color}`}>{e.label}</span>
          <span className="text-xs text-gray-400 mt-0.5">{e.sublabel}</span>
        </button>
      ))}
    </div>
  );
}
