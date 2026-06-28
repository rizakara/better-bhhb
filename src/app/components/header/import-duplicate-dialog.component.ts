import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface ImportDuplicateDialogData {
  duplicateCount: number;
  totalItems: number;
}

export type ImportDuplicateDialogResult = 'keep-all' | 'keep-one';

@Component({
    selector: 'app-import-duplicate-dialog',
    template: `
    <h2 mat-dialog-title>
      Duplicate items found
      <button type="button" class="dialog-close-x" mat-dialog-close aria-label="Close">×</button>
    </h2>
    <mat-dialog-content>
      <p>
        Found <strong>{{ data.duplicateCount }}</strong> duplicate item(s) while merging
        <strong>{{ data.totalItems }}</strong> total item(s).
      </p>
      <p>Keep every duplicate entry, or keep only one of each?</p>
    </mat-dialog-content>
    <mat-dialog-actions class="import-dialog-actions">
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <div class="import-dialog-actions-primary">
        <button mat-button type="button" (click)="confirm('keep-one')">Keep only one</button>
        <button mat-button color="primary" type="button" cdkFocusInitial (click)="confirm('keep-all')">Keep all</button>
      </div>
    </mat-dialog-actions>
  `,
    styles: [`
    :host {
      display: block;
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
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ImportDuplicateDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ImportDuplicateDialogData,
    private dialogRef: MatDialogRef<ImportDuplicateDialogComponent, ImportDuplicateDialogResult | undefined>,
  ) {}

  confirm(result: ImportDuplicateDialogResult): void {
    this.dialogRef.close(result);
  }
}