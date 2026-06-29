import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { BurpImportService } from './services/burp-import/burp-import.service';
import { ThemeService } from './services/theme/theme.service';
import { DisplayPreferencesService } from './services/display/display-preferences.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit {
  title = 'burp-http-history-browser';

  constructor(
    private themeService: ThemeService,
    private displayPreferencesService: DisplayPreferencesService,
    private burpImportService: BurpImportService,
  ) {}

  ngOnInit(): void {
    this.themeService.initialize();
    this.displayPreferencesService.initialize();
    this.burpImportService.startListening();
    if (this.burpImportService.shouldAutoImportFromUrl()) {
      void this.burpImportService.importFromCurrentUrl().catch(() => undefined);
    }
  }
}
