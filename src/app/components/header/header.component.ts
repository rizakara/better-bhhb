import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ExportFilterState, FileHandleService } from "../../services/file-handle/file-handle.service"
import { Theme, ThemeService } from "../../services/theme/theme.service";
import { Subscription } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BurpImportService } from '../../services/burp-import/burp-import.service';
import { SessionHistoryDialogComponent } from './session-history-dialog.component';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {

  constructor(
    private FileHandleService: FileHandleService,
    private burpImportService: BurpImportService,
    public dialog: MatDialog,
    public themeService: ThemeService,
    private snackBar: MatSnackBar,
  ) { }

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  fileSub!: Subscription
  exportFilterSub!: Subscription
  importSub!: Subscription
  selectedFileName!: string;
  exportFilterState: ExportFilterState = {
    visibleCount: 0,
    totalCount: 0,
    positions: [],
    isSubset: false,
    uniqueHosts: 0,
    statusBreakdown: {
      success: 0,
      redirect: 0,
      clientError: 0,
      serverError: 0,
      other: 0,
    },
  };
  isLoading: boolean = false;
  burpImportMessage = '';
  burpImportStatus: 'idle' | 'listening' | 'loading' | 'success' | 'error' = 'idle';
  private lastBurpImportNotice = '';

  ngOnInit(): void {
    if (localStorage.getItem("gotIt") != "true") {
      this.infoDialog()
    }
    this.fileSub = this.FileHandleService.getselectedFileDataListener()
      .subscribe((selectedFileData: { selectedFileName: string }) => {
        this.selectedFileName = selectedFileData.selectedFileName
        this.isLoading = false
      })
    this.exportFilterSub = this.FileHandleService.getExportFilterStateListener()
      .subscribe((state) => {
        this.exportFilterState = state;
      })

    this.importSub = this.FileHandleService.getImportingListener()
      .subscribe((importing) => {
        if (importing) {
          this.isLoading = true;
        } else {
          // Turn off only if we had a file (restore path manages its own)
          if (this.selectedFileName) {
            this.isLoading = false;
          }
        }
      });

    this.burpImportService.getStateListener()
      .subscribe((state) => {
        this.burpImportStatus = state.status;
        this.burpImportMessage = state.message;
        if (state.status === 'loading') {
          this.isLoading = true;
          return;
        }

        const noticeKey = `${state.status}:${state.message}:${state.itemCount ?? ''}`;
        if (noticeKey === this.lastBurpImportNotice) {
          return;
        }

        if (state.status === 'success' && state.message) {
          const suffix = state.itemCount ? ` (${state.itemCount} items)` : '';
          this.snackBar.open(`${state.message}${suffix}`, 'Dismiss', { duration: 5000 });
          this.lastBurpImportNotice = noticeKey;
          this.burpImportService.resetState();
          return;
        }

        if (state.status === 'error' && state.message) {
          this.snackBar.open(state.message, 'Dismiss', { duration: 7000 });
          this.lastBurpImportNotice = noticeKey;
        }
      });

    this.isLoading = true
    void this.FileHandleService.ensureSessionRestored()
      .finally(() => {
        if (!this.selectedFileName) {
          this.isLoading = false
        }
      })
  }

  openFilePicker(): void {
    this.fileInput.nativeElement.click();
  }

  importFiles(event: Event): void {
    this.isLoading = true
    this.FileHandleService.importFiles(event)
      .then(() => { })
      .catch((err) => {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Failed to import files.');
        this.isLoading = false
      })
  }

  saveCurrentFile(scope: 'all' | 'filtered' = 'all'): void {
    void this.FileHandleService.saveAs(scope).catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save file.');
    });
  }

  fileRemoved(): void {
    this.isLoading = true
    this.FileHandleService.fileClear()
      .then(() => {
        this.isLoading = false
      })
      .catch(() => { })
  }

  infoDialog() {
    if (this.dialog.openDialogs.length == 0) {
      this.dialog.open(InfoDialogComponent, {
        width: '900px',
        panelClass: 'bhhb-dialog',
      });
    }
  }

  openSessionHistory(): void {
    this.dialog.open(SessionHistoryDialogComponent, {
      width: '720px',
      maxHeight: '80vh',
      panelClass: 'bhhb-dialog',
    });
  }

  retryBurpImport(): void {
    this.lastBurpImportNotice = '';
    void this.burpImportService.importFromLocalhost().catch(() => undefined);
  }

  checkForBurpImport(): void {
    this.burpImportService.scanNow();
  }
}

@Component({
  templateUrl: './info-dialog.component.html',
  styleUrls: ['./info-dialog.component.css']
})
export class InfoDialogComponent {
  gotIt() {
    localStorage.setItem("gotIt", "true")
  }
}