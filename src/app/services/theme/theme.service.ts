import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Theme {
  id: string;
  name: string;
  type: 'light' | 'dark';
}

export const THEMES: Theme[] = [
  // Dark themes first; existing dark is default
  { id: 'dark', name: 'Dark', type: 'dark' },
  { id: 'dracula', name: 'Dracula', type: 'dark' },
  { id: 'nord', name: 'Nord', type: 'dark' },
  { id: 'solarized-dark', name: 'Solarized Dark', type: 'dark' },
  { id: 'github-dark', name: 'GitHub Dark', type: 'dark' },
  { id: 'one-dark', name: 'One Dark', type: 'dark' },
  // Light themes; preserve existing light
  { id: 'light', name: 'Light', type: 'light' },
  { id: 'solarized-light', name: 'Solarized Light', type: 'light' },
  { id: 'github-light', name: 'GitHub Light', type: 'light' },
  { id: 'one-light', name: 'One Light', type: 'light' },
];

const STORAGE_KEY = 'bhhb-theme';
const DEFAULT_THEME_ID = 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private currentThemeSubject = new BehaviorSubject<Theme>(this.loadTheme());
  readonly currentTheme$: Observable<Theme> = this.currentThemeSubject.asObservable();

  get currentTheme(): Theme {
    return this.currentThemeSubject.value;
  }

  get themes(): Theme[] {
    return THEMES;
  }

  get darkThemes(): Theme[] {
    return THEMES.filter((t) => t.type === 'dark');
  }

  get lightThemes(): Theme[] {
    return THEMES.filter((t) => t.type === 'light');
  }

  setTheme(themeId: string): void {
    const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
    this.applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme.id);
    this.currentThemeSubject.next(theme);
  }

  private loadTheme(): Theme {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const found = THEMES.find((t) => t.id === saved);
      if (found) return found;
    }
    // Default to existing dark theme
    return THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
  }

  private applyTheme(theme: Theme): void {
    const body = document.body;
    // Remove previous theme-* and theme-is-* classes
    const toRemove: string[] = [];
    body.classList.forEach((cls) => {
      if (cls.startsWith('theme-')) {
        toRemove.push(cls);
      }
    });
    toRemove.forEach((cls) => body.classList.remove(cls));

    body.classList.add(`theme-${theme.id}`);
    if (theme.type === 'dark') {
      body.classList.add('theme-is-dark');
    }
    // Maintain legacy class for the original dark for any external references
    if (theme.id === 'dark') {
      body.classList.add('dark-theme');
    } else {
      body.classList.remove('dark-theme');
    }
  }

  initialize(): void {
    // Ensure class is applied on startup
    this.applyTheme(this.currentTheme);
  }
}
