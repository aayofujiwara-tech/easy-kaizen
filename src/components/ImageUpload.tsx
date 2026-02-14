"use client";

import { useRef, useState } from "react";

interface Props {
  onImageSelect: (file: File | null) => void;
}

export default function ImageUpload({ onImageSelect }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onImageSelect(file);

    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onImageSelect(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
        id="image-upload"
      />

      {!preview ? (
        <label
          htmlFor="image-upload"
          className="flex flex-col items-center justify-center gap-1 w-full py-4 rounded-2xl bg-purple-50 text-purple-700 border-2 border-purple-200 cursor-pointer hover:bg-purple-100 transition font-bold"
        >
          <span className="text-3xl" role="img" aria-label="カメラ">📷</span>
          <span className="text-sm">しゃしん</span>
        </label>
      ) : (
        <div className="relative">
          <img
            src={preview}
            alt="プレビュー"
            className="w-full max-h-32 sm:max-h-48 object-cover rounded-xl"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-10 h-10 flex items-center justify-center text-base"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
