import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AngularMaterialModule } from './modules/angular-material/angular-material.module';
import { HeaderComponent, InfoDialogComponent } from './components/header/header.component';
import { ImportModeDialogComponent } from './components/header/import-mode-dialog.component';
import { ImportDestinationDialogComponent } from './components/header/import-destination-dialog.component';
import { ImportDuplicateDialogComponent } from './components/header/import-duplicate-dialog.component';
import { SessionHistoryDialogComponent } from './components/header/session-history-dialog.component';
import { MainComponent } from './components/main/main.component';
import { InspectorPanelComponent } from './components/inspector/inspector-panel.component';
import { FooterComponent } from './components/footer/footer.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from '../environments/environment';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    InfoDialogComponent,
    ImportModeDialogComponent,
    ImportDestinationDialogComponent,
    ImportDuplicateDialogComponent,
    SessionHistoryDialogComponent,
    MainComponent,
    InspectorPanelComponent,
    FooterComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    BrowserAnimationsModule,
    AngularMaterialModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
