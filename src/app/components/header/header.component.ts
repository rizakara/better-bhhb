import { Component, ElementRef, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { ExportFilterState, FileHandleService } from "../../services/file-handle/file-handle.service"
import { Theme, ThemeService } from "../../services/theme/theme.service";
import { Subscription } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BurpImportService } from '../../services/burp-import/burp-import.service';
import { SessionHistoryDialogComponent } from './session-history-dialog.component';
import { WorkspaceService } from '../../services/workspace/workspace.service';
import { WorkspaceTabData } from '../../services/workspace/workspace-view-state';

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HeaderComponent implements OnInit {

  constructor(
    private FileHandleService: FileHandleService,
    private burpImportService: BurpImportService,
    private workspaceService: WorkspaceService,
    public dialog: MatDialog,
    public themeService: ThemeService,
    private snackBar: MatSnackBar,
  ) { }

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('workspaceInput') workspaceInput!: ElementRef<HTMLInputElement>;
  @ViewChild('workspaceRenameInput') workspaceRenameInput?: ElementRef<HTMLInputElement>;

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
  workspaceTabs: WorkspaceTabData[] = [];
  activeWorkspaceTabId: string | null = null;
  renamingTabId: string | null = null;
  renamingTabLabel = '';

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

    this.workspaceService.getTabsListener()
      .subscribe((tabs) => {
        this.workspaceTabs = tabs;
      });
    this.workspaceService.getActiveTabIdListener()
      .subscribe((tabId) => {
        this.activeWorkspaceTabId = tabId;
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

  exportActiveWorkspace(): void {
    void this.FileHandleService.exportActiveWorkspace().catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to export workspace.');
    });
  }

  exportAllWorkspaces(): void {
    void this.FileHandleService.exportAllWorkspaces().catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to export workspaces.');
    });
  }

  openWorkspacePicker(): void {
    this.workspaceInput.nativeElement.click();
  }

  importWorkspace(event: Event): void {
    this.isLoading = true;
    void this.FileHandleService.importWorkspace(event)
      .catch((err) => {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Failed to import workspace.');
      })
      .finally(() => {
        this.isLoading = false;
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

  createWorkspaceTab(): void {
    void this.FileHandleService.createWorkspaceTab().catch((err) => {
      console.error(err);
      this.snackBar.open('Failed to create workspace', undefined, { duration: 3000 });
    });
  }

  switchWorkspaceTab(tabId: string): void {
    if (tabId === this.activeWorkspaceTabId) {
      return;
    }
    void this.FileHandleService.switchWorkspaceTab(tabId).catch((err) => {
      console.error(err);
      this.snackBar.open('Failed to switch workspace', undefined, { duration: 3000 });
    });
  }

  closeWorkspaceTab(event: Event, tabId: string): void {
    event.stopPropagation();
    void this.FileHandleService.closeWorkspaceTab(tabId).catch((err) => {
      console.error(err);
      this.snackBar.open('Failed to close workspace', undefined, { duration: 3000 });
    });
  }

  get activeWorkspaceLabel(): string {
    const tab = this.workspaceTabs.find((candidate) => candidate.id === this.activeWorkspaceTabId);
    return tab?.label ?? 'Workspace';
  }

  startRenamingActiveTab(): void {
    const tab = this.workspaceTabs.find((candidate) => candidate.id === this.activeWorkspaceTabId);
    if (!tab) {
      return;
    }
    this.renamingTabId = tab.id;
    this.renamingTabLabel = tab.label;
    setTimeout(() => {
      const input = this.workspaceRenameInput?.nativeElement;
      input?.focus();
      input?.select();
    }, 0);
  }

  commitRenamingTab(): void {
    if (!this.renamingTabId) {
      return;
    }
    this.FileHandleService.renameWorkspaceTab(this.renamingTabId, this.renamingTabLabel);
    this.renamingTabId = null;
    this.renamingTabLabel = '';
  }

  cancelRenamingTab(): void {
    this.renamingTabId = null;
    this.renamingTabLabel = '';
  }

  onRenamingTabKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRenamingTab();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRenamingTab();
    }
  }

  getWorkspaceTabTitle(tab: WorkspaceTabData): string {
    if (tab.fileName) {
      return `${tab.label} (${tab.fileName})`;
    }
    return tab.label;
  }
}

@Component({
    templateUrl: './info-dialog.component.html',
    styleUrls: ['./info-dialog.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class InfoDialogComponent {
  gotIt() {
    localStorage.setItem("gotIt", "true")
  }
}