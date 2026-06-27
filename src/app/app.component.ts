import { Component, OnInit } from '@angular/core';
import { BurpImportService } from './services/burp-import/burp-import.service';
import { ThemeService } from './services/theme/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'burp-http-history-browser';

  constructor(
    private themeService: ThemeService,
    private burpImportService: BurpImportService,
  ) {}

  ngOnInit(): void {
    this.themeService.initialize();
    this.burpImportService.startListening();
    if (this.burpImportService.shouldAutoImportFromUrl()) {
      void this.burpImportService.importFromCurrentUrl().catch(() => undefined);
    }
  }
}
