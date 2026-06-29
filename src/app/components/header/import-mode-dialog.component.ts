import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface ImportModeDialogData {
  existingName: string;
  newFileCount: number;
}

@Component({
    selector: 'app-import-mode-dialog',
    template: `
    <h2 mat-dialog-title>
      Import files
      <button type="button" class="dialog-close-x" [mat-dialog-close] aria-label="Close">×</button>
    </h2>
    <mat-dialog-content>
      <p>You already have a file open:</p>
      <p class="file-name">{{ data.existingName }}</p>
      <p class="spacer">Adding <strong>{{ data.newFileCount }}</strong> new file(s).</p>
      <p>Would you like to merge with the existing one or discard the existing one?</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="'replace'">
        Discard the existing one
      </button>
      <button mat-button cdkFocusInitial [mat-dialog-close]="'merge'">
        Merge with existing one
      </button>
    </mat-dialog-actions>
  `,
    styles: [`
    :host {
      display: block;
    }
    .file-name {
      font-weight: 600;
      word-break: break-all;
      margin: 4px 0 12px;
      padding: 4px 8px;
      background: rgba(0,0,0,0.04);
      border-radius: 4px;
    }
    .spacer {
      margin: 12px 0 4px;
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
      font-size: var(--fs-lg);
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
    ::ng-deep .mat-dialog-container,
    ::ng-deep .mat-mdc-dialog-container {
      box-shadow: unset;
      border: 1px solid var(--border-color);
      background: var(--bg-primary);
      color: inherit;
    }
    body.theme-is-dark ::ng-deep .mat-dialog-container,
    body.theme-is-dark ::ng-deep .mat-mdc-dialog-container {
      background-color: var(--bg-primary);
      color: inherit;
    }
  `],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ImportModeDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: ImportModeDialogData) {}
}
