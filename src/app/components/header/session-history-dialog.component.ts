import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { StoredHistoryEntry } from '../../services/file-handle/file-session-storage.service';
import { FileHandleService } from '../../services/file-handle/file-handle.service';

@Component({
  selector: 'app-session-history-dialog',
  templateUrl: './session-history-dialog.component.html',
  styleUrls: ['./session-history-dialog.component.css']
})
export class SessionHistoryDialogComponent implements OnInit {
  entries: StoredHistoryEntry[] = [];
  loading = true;
  errorMessage = '';

  constructor(
    private fileHandleService: FileHandleService,
    public dialogRef: MatDialogRef<SessionHistoryDialogComponent>,
  ) {}

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.entries = await this.fileHandleService.listImportHistory();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load import history.';
    } finally {
      this.loading = false;
    }
  }

  async openEntry(entry: StoredHistoryEntry): Promise<void> {
    try {
      await this.fileHandleService.openHistoryEntry(entry.id);
      this.dialogRef.close(true);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to open the selected session.';
    }
  }

  async deleteEntry(entry: StoredHistoryEntry, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    try {
      await this.fileHandleService.deleteHistoryEntry(entry.id);
      this.entries = this.entries.filter((candidate) => candidate.id !== entry.id);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to delete the selected session.';
    }
  }

  formatImportedAt(value: string): string {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return value;
    }
    return new Date(parsed).toLocaleString();
  }
}