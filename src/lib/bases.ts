export interface Base {
  id: string;
  label: string;
}

export const BASES: Base[] = [
  { id: "hq", label: "本社" },
  { id: "pacific", label: "パシフィック" },
  { id: "pearl", label: "パール" },
  { id: "selene", label: "セレーネ" },
];

export const BASE_MAP: Record<string, string> = Object.fromEntries(
  BASES.map((b) => [b.id, b.label])
);

export function getBaseLabel(baseId: string): string {
  return BASE_MAP[baseId] || baseId;
}
