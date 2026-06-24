import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ExportFilterState, FileHandleService, BurpExport } from '../../services/file-handle/file-handle.service'

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class FooterComponent implements OnInit, OnDestroy {

  constructor(private FileHandleService: FileHandleService) { }

  fileSub!: Subscription;
  viewStateSub!: Subscription;
  burpVersion = '';
  exportTime = '';
  viewState: ExportFilterState = {
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

  get hasData(): boolean {
    return this.viewState.totalCount > 0;
  }

  get hasStatusBreakdown(): boolean {
    const breakdown = this.viewState.statusBreakdown;
    return breakdown.success + breakdown.redirect + breakdown.clientError + breakdown.serverError + breakdown.other > 0;
  }

  ngOnInit(): void {
    this.fileSub = this.FileHandleService.getselectedFileDataListener()
      .subscribe((selectedFileData: { selectedFileContent: BurpExport | undefined }) => {
        if (!selectedFileData.selectedFileContent) {
          this.burpVersion = '';
          this.exportTime = '';
          return;
        }
        this.burpVersion = selectedFileData.selectedFileContent.items.$.burpVersion;
        this.exportTime = selectedFileData.selectedFileContent.items.$.exportTime;
      });
    this.viewStateSub = this.FileHandleService.getExportFilterStateListener()
      .subscribe((state) => {
        this.viewState = state;
      });
  }

  ngOnDestroy(): void {
    this.fileSub?.unsubscribe();
    this.viewStateSub?.unsubscribe();
  }
}