export const ROW_HIGHLIGHT_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'pink',
  'mauve',
  'gray',
] as const;

export type RowHighlightColor = typeof ROW_HIGHLIGHT_COLORS[number];

export interface RowHighlightOption {
  color: RowHighlightColor;
  label: string;
}

export const ROW_HIGHLIGHT_OPTIONS: RowHighlightOption[] = [
  { color: 'red', label: 'Interesting' },
  { color: 'orange', label: 'Review' },
  { color: 'yellow', label: 'Suspicious' },
  { color: 'green', label: 'Baseline' },
  { color: 'cyan', label: 'Info' },
  { color: 'blue', label: 'Follow-up' },
  { color: 'pink', label: 'Out of scope' },
  { color: 'mauve', label: 'Duplicate' },
  { color: 'gray', label: 'Noise' },
];

export function isRowHighlightColor(value: string | null | undefined): value is RowHighlightColor {
  return !!value && (ROW_HIGHLIGHT_COLORS as readonly string[]).includes(value);
}

export function normalizeRowHighlight(value: unknown): RowHighlightColor | null {
  const raw = Array.isArray(value) ? value[0] : value;
  let normalized = raw == null ? '' : String(raw).trim().toLowerCase();
  if (normalized === 'magenta') {
    normalized = 'mauve';
  }
  return isRowHighlightColor(normalized) ? normalized : null;
}

export function normalizeRowBookmark(value: unknown): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null) {
    return false;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}