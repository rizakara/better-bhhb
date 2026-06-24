import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ExportFilterState, FileHandleService } from "../../services/file-handle/file-handle.service"
import { Subscription } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {

  constructor(private FileHandleService: FileHandleService, public dialog: MatDialog) { }

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  fileSub!: Subscription
  exportFilterSub!: Subscription
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
    try {
      this.FileHandleService.saveAs(scope);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save file.');
    }
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
      });
    }
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