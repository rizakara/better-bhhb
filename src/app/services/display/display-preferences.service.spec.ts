import { TestBed } from '@angular/core/testing';

import { DISPLAY_DEFAULTS, DisplayPreferencesService } from './display-preferences.service';

describe('DisplayPreferencesService', () => {
  let service: DisplayPreferencesService;

  beforeEach(() => {
    localStorage.removeItem('bhhb-display-preferences');
    document.documentElement.style.removeProperty('--font-scale');
    document.documentElement.style.removeProperty('--row-scale');
    document.documentElement.style.removeProperty('--mono-scale');

    TestBed.configureTestingModule({});
    service = TestBed.inject(DisplayPreferencesService);
  });

  afterEach(() => {
    localStorage.removeItem('bhhb-display-preferences');
  });

  it('should be created with defaults', () => {
    expect(service).toBeTruthy();
    expect(service.preferences).toEqual(DISPLAY_DEFAULTS);
  });

  it('should apply and persist UI font changes', () => {
    service.setUiFontPercent(112);

    expect(service.preferences.uiFontPercent).toBe(112);
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.12');
    expect(JSON.parse(localStorage.getItem('bhhb-display-preferences')!)).toEqual({
      uiFontPercent: 112,
      rowDensityPercent: 100,
      monoFontPercent: 100,
    });
  });

  it('should apply and persist row density changes', () => {
    service.setRowDensityPercent(88);

    expect(service.preferences.rowDensityPercent).toBe(88);
    expect(document.documentElement.style.getPropertyValue('--row-scale')).toBe('0.88');
  });

  it('should apply and persist monospace font changes', () => {
    service.setMonoFontPercent(125);

    expect(service.preferences.monoFontPercent).toBe(125);
    expect(document.documentElement.style.getPropertyValue('--mono-scale')).toBe('1.25');
  });

  it('should migrate legacy preset storage', () => {
    localStorage.setItem('bhhb-display-preferences', JSON.stringify({
      fontSize: 'large',
      rowDensity: 'comfortable',
    }));

    const migrated = new DisplayPreferencesService();

    expect(migrated.preferences).toEqual({
      uiFontPercent: 112,
      rowDensityPercent: 120,
      monoFontPercent: 100,
    });
  });

  it('should reset to defaults', () => {
    service.setUiFontPercent(125);
    service.setRowDensityPercent(120);
    service.setMonoFontPercent(85);
    service.resetToDefaults();

    expect(service.preferences).toEqual(DISPLAY_DEFAULTS);
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--row-scale')).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--mono-scale')).toBe('1');
  });
});