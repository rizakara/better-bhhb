import { Component, OnDestroy, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'burp-http-history-browser';
  private themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly themeListener = () => this.applyThemeClass();

  ngOnInit(): void {
    this.applyThemeClass();
    this.themeMediaQuery.addEventListener('change', this.themeListener);
  }

  ngOnDestroy(): void {
    this.themeMediaQuery.removeEventListener('change', this.themeListener);
  }

  private applyThemeClass(): void {
    document.body.classList.toggle('dark-theme', this.themeMediaQuery.matches);
  }
}
