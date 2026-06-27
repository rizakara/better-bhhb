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
  opening = false;
  errorMessage = '';
  selectedIds = new Set<string>();

  constructor(
    private fileHandleService: FileHandleService,
    public dialogRef: MatDialogRef<SessionHistoryDialogComponent>,
  ) {}

  ngOnInit(): void {
    void this.refresh();
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get allSelected(): boolean {
    return this.entries.length > 0 && this.selectedIds.size === this.entries.length;
  }

  get someSelected(): boolean {
    return this.selectedIds.size > 0 && !this.allSelected;
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.entries = await this.fileHandleService.listImportHistory();
      this.selectedIds.clear();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load import history.';
    } finally {
      this.loading = false;
    }
  }

  isSelected(entry: StoredHistoryEntry): boolean {
    return this.selectedIds.has(entry.id);
  }

  toggleEntry(entry: StoredHistoryEntry, checked: boolean): void {
    if (checked) {
      this.selectedIds.add(entry.id);
      return;
    }
    this.selectedIds.delete(entry.id);
  }

  toggleSelectAll(checked: boolean): void {
    if (checked) {
      this.selectedIds = new Set(this.entries.map((entry) => entry.id));
      return;
    }
    this.selectedIds.clear();
  }

  async openSelected(): Promise<void> {
    if (!this.selectedCount || this.opening) {
      return;
    }

    this.opening = true;
    this.errorMessage = '';
    try {
      const opened = await this.fileHandleService.openHistoryEntries([...this.selectedIds]);
      if (opened) {
        this.dialogRef.close(true);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to open the selected session(s).';
    } finally {
      this.opening = false;
    }
  }

  async deleteEntry(entry: StoredHistoryEntry, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    try {
      await this.fileHandleService.deleteHistoryEntry(entry.id);
      this.entries = this.entries.filter((candidate) => candidate.id !== entry.id);
      this.selectedIds.delete(entry.id);
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