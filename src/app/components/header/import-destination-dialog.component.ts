import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface ImportDestinationOption {
  id: string;
  label: string;
  fileName?: string;
  hasContent: boolean;
  isActive: boolean;
}

export interface ImportDestinationDialogData {
  workspaces: ImportDestinationOption[];
  newFileCount: number;
}

export interface ImportDestinationDialogResult {
  workspaceId: string | 'new';
  mode: 'merge' | 'replace';
}

@Component({
  selector: 'app-import-destination-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>
      Import files
      <button type="button" class="dialog-close-x" mat-dialog-close aria-label="Close">×</button>
    </h2>
    <mat-dialog-content>
      <p class="import-intro">
        Adding <strong>{{ data.newFileCount }}</strong> new file(s). Choose which workspace to import into.
      </p>

      <div class="workspace-options" role="radiogroup" aria-label="Import destination">
        <button type="button" class="workspace-option"
          *ngFor="let workspace of data.workspaces"
          [class.workspace-option-selected]="selectedWorkspaceId === workspace.id"
          [attr.aria-checked]="selectedWorkspaceId === workspace.id"
          role="radio"
          (click)="selectWorkspace(workspace.id)">
          <span class="workspace-option-main">
            <span class="workspace-option-label">
              {{ workspace.label }}
              <span class="workspace-option-badge" *ngIf="workspace.isActive">current</span>
            </span>
            <span class="workspace-option-meta" *ngIf="workspace.fileName">{{ workspace.fileName }}</span>
            <span class="workspace-option-meta workspace-option-meta-empty" *ngIf="!workspace.fileName">No file loaded</span>
          </span>
        </button>

        <button type="button" class="workspace-option"
          [class.workspace-option-selected]="selectedWorkspaceId === 'new'"
          [attr.aria-checked]="selectedWorkspaceId === 'new'"
          role="radio"
          (click)="selectWorkspace('new')">
          <span class="workspace-option-main">
            <span class="workspace-option-label">New workspace</span>
            <span class="workspace-option-meta">Open in a separate workspace</span>
          </span>
        </button>
      </div>

      <p class="import-mode-hint" *ngIf="selectedHasContent">
        <strong>{{ selectedWorkspaceLabel }}</strong> already has data.
        Merge the new file(s) with it, or discard the existing data.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions class="import-dialog-actions">
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <div class="import-dialog-actions-primary">
        <ng-container *ngIf="selectedHasContent; else importEmpty">
          <button mat-button type="button" (click)="confirm('replace')">Replace</button>
          <button mat-button color="primary" type="button" cdkFocusInitial (click)="confirm('merge')">Merge</button>
        </ng-container>
        <ng-template #importEmpty>
          <button mat-button color="primary" type="button" cdkFocusInitial (click)="confirm('replace')">Import</button>
        </ng-template>
      </div>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
    }

    .import-intro {
      margin: 0 0 12px;
    }

    .workspace-options {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .workspace-option {
      display: flex;
      align-items: flex-start;
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--input-bg);
      color: inherit;
      cursor: pointer;
      font: inherit;
      text-align: left;
    }

    .workspace-option:hover {
      background: var(--hover-bg);
      border-color: var(--border-color-strong);
    }

    .workspace-option-selected {
      border-color: var(--border-color-strong);
      background: var(--selected-bg);
      font-weight: 600;
    }

    .workspace-option-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .workspace-option-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }

    .workspace-option-badge {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .workspace-option-meta {
      font-size: 11px;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .workspace-option-meta-empty {
      font-style: italic;
    }

    .import-mode-hint {
      margin: 14px 0 0;
      font-size: 13px;
      color: var(--text-secondary);
    }

    mat-dialog-content p {
      margin: 4px 0;
    }

    h2[mat-dialog-title] {
      position: relative;
      padding-right: 28px;
    }

    .dialog-close-x {
      position: absolute;
      top: -2px;
      right: 0;
      width: 22px;
      height: 22px;
      line-height: 20px;
      font-size: 18px;
      font-weight: 600;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      opacity: 0.65;
      padding: 0;
      margin: 0;
    }

    .dialog-close-x:hover {
      opacity: 1;
    }


  `],
})
export class ImportDestinationDialogComponent {
  selectedWorkspaceId: string | 'new';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ImportDestinationDialogData,
    private dialogRef: MatDialogRef<ImportDestinationDialogComponent, ImportDestinationDialogResult | undefined>,
  ) {
    const active = data.workspaces.find((workspace) => workspace.isActive);
    this.selectedWorkspaceId = active?.id ?? data.workspaces[0]?.id ?? 'new';
  }

  get selectedHasContent(): boolean {
    if (this.selectedWorkspaceId === 'new') {
      return false;
    }
    const workspace = this.data.workspaces.find((entry) => entry.id === this.selectedWorkspaceId);
    return !!workspace?.hasContent;
  }

  get selectedWorkspaceLabel(): string {
    if (this.selectedWorkspaceId === 'new') {
      return 'New workspace';
    }
    return this.data.workspaces.find((entry) => entry.id === this.selectedWorkspaceId)?.label ?? 'Workspace';
  }

  selectWorkspace(workspaceId: string | 'new'): void {
    this.selectedWorkspaceId = workspaceId;
  }

  confirm(mode: 'merge' | 'replace'): void {
    this.dialogRef.close({
      workspaceId: this.selectedWorkspaceId,
      mode,
    });
  }
}