import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { BurpImportService } from './services/burp-import/burp-import.service';
import { ThemeService } from './services/theme/theme.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      providers: [
        { provide: ThemeService, useValue: { initialize: jasmine.createSpy('initialize') } },
        {
          provide: BurpImportService,
          useValue: {
            startListening: jasmine.createSpy('startListening'),
            shouldAutoImportFromUrl: () => false,
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it(`should have as title 'burp-http-history-browser'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.title).toBe('burp-http-history-browser');
  });
});