import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface DisplayPreferences {
  uiFontPercent: number;
  rowDensityPercent: number;
  monoFontPercent: number;
}

export const DISPLAY_DEFAULTS: DisplayPreferences = {
  uiFontPercent: 100,
  rowDensityPercent: 100,
  monoFontPercent: 100,
};

const STORAGE_KEY = 'bhhb-display-preferences';
const MIN_PERCENT = 85;
const MAX_PERCENT = 125;
const MIN_ROW_PERCENT = 88;
const MAX_ROW_PERCENT = 120;

const LEGACY_FONT_SCALES: Record<string, number> = {
  small: 90,
  default: 100,
  large: 112,
  'extra-large': 125,
};

const LEGACY_ROW_SCALES: Record<string, number> = {
  compact: 88,
  default: 100,
  comfortable: 120,
};

@Injectable({ providedIn: 'root' })
export class DisplayPreferencesService {
  private readonly preferencesSubject = new BehaviorSubject<DisplayPreferences>(this.loadPreferences());
  readonly preferences$: Observable<DisplayPreferences> = this.preferencesSubject.asObservable();

  get preferences(): DisplayPreferences {
    return this.preferencesSubject.value;
  }

  setUiFontPercent(percent: number): void {
    this.updatePreferences({ uiFontPercent: this.clampPercent(percent) });
  }

  setRowDensityPercent(percent: number): void {
    this.updatePreferences({
      rowDensityPercent: this.clampPercent(percent, MIN_ROW_PERCENT, MAX_ROW_PERCENT),
    });
  }

  setMonoFontPercent(percent: number): void {
    this.updatePreferences({ monoFontPercent: this.clampPercent(percent) });
  }

  resetToDefaults(): void {
    this.updatePreferences({ ...DISPLAY_DEFAULTS });
  }

  initialize(): void {
    this.applyPreferences(this.preferences);
  }

  formatPercent(percent: number): string {
    return `${Math.round(percent)}%`;
  }

  private updatePreferences(patch: Partial<DisplayPreferences>): void {
    const next: DisplayPreferences = { ...this.preferences, ...patch };
    this.applyPreferences(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    this.preferencesSubject.next(next);
  }

  private loadPreferences(): DisplayPreferences {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DISPLAY_DEFAULTS };
    }

    try {
      const parsed = JSON.parse(raw) as Partial<DisplayPreferences> & {
        fontSize?: string;
        rowDensity?: string;
      };

      if (typeof parsed.uiFontPercent === 'number') {
        return {
          uiFontPercent: this.clampPercent(parsed.uiFontPercent),
          rowDensityPercent: this.clampPercent(
            parsed.rowDensityPercent ?? DISPLAY_DEFAULTS.rowDensityPercent,
            MIN_ROW_PERCENT,
            MAX_ROW_PERCENT,
          ),
          monoFontPercent: this.clampPercent(parsed.monoFontPercent ?? DISPLAY_DEFAULTS.monoFontPercent),
        };
      }

      return {
        uiFontPercent: LEGACY_FONT_SCALES[parsed.fontSize ?? 'default'] ?? DISPLAY_DEFAULTS.uiFontPercent,
        rowDensityPercent: LEGACY_ROW_SCALES[parsed.rowDensity ?? 'default'] ?? DISPLAY_DEFAULTS.rowDensityPercent,
        monoFontPercent: DISPLAY_DEFAULTS.monoFontPercent,
      };
    } catch {
      return { ...DISPLAY_DEFAULTS };
    }
  }

  private applyPreferences(preferences: DisplayPreferences): void {
    const root = document.documentElement;
    root.style.setProperty('--font-scale', String(preferences.uiFontPercent / 100));
    root.style.setProperty('--row-scale', String(preferences.rowDensityPercent / 100));
    root.style.setProperty('--mono-scale', String(preferences.monoFontPercent / 100));
  }

  private clampPercent(
    value: number,
    min = MIN_PERCENT,
    max = MAX_PERCENT,
  ): number {
    if (!Number.isFinite(value)) {
      return DISPLAY_DEFAULTS.uiFontPercent;
    }
    return Math.min(max, Math.max(min, Math.round(value)));
  }
}