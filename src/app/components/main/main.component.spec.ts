import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { MainComponent } from './main.component';
import { FileHandleService } from '../../services/file-handle/file-handle.service';
import { RequestReplayService } from '../../services/request-replay/request-replay.service';
import { HttpDiffService } from '../../services/http-diff/http-diff.service';
import { WorkspaceService } from '../../services/workspace/workspace.service';

describe('MainComponent', () => {
  let component: MainComponent;
  let fixture: ComponentFixture<MainComponent>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      declarations: [MainComponent],
      providers: [
        {
          provide: FileHandleService,
          useValue: {
            getselectedFileDataListener: () => of({ selectedFileContent: undefined }),
            onBeforeSave: () => of(undefined),
            setExportFilterState: () => undefined,
            clearEdits: () => undefined,
            hasRequestEdit: () => false,
            hasCommentEdit: () => false,
            getRequestEdit: () => undefined,
            getCommentEdit: () => undefined,
            setRequestEdit: () => undefined,
            setCommentEdit: () => undefined,
          },
        },
        {
          provide: RequestReplayService,
          useValue: {
            requestPartsToRaw: () => '',
            rawRequestToParts: () => [[], ''],
            rawRequestToCurl: () => '',
          },
        },
        { provide: MatSnackBar, useValue: snackBar },
        HttpDiffService,
        WorkspaceService,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    localStorage.clear();
    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hides and shows columns', () => {
    component.toggleColumnVisibility('mimetype', false);
    component.toggleColumnVisibility('title', false);

    expect(component.isColumnVisible('mimetype')).toBeFalse();
    expect(component.isColumnVisible('title')).toBeFalse();
    expect(component.displayedColumns).not.toContain('mimetype');
    expect(component.displayedColumns).not.toContain('title');
    expect(component.hiddenColumnCount).toBe(2);
  });

  it('prevents hiding the last visible column', () => {
    component.columnOrder.forEach((key) => component.toggleColumnVisibility(key, false));

    expect(component.displayedColumns.length).toBe(1);
    expect(snackBar.open).toHaveBeenCalled();
  });

  it('persists column layout to localStorage', () => {
    component.toggleColumnVisibility('mimetype', false);
    component.toggleColumnVisibility('title', false);

    const stored = JSON.parse(localStorage.getItem('bhhb-table-column-layout') ?? '{}');
    expect(stored.hidden).toEqual(['mimetype', 'title']);
    expect(stored.order).toEqual(component.columnOrder);
  });

  it('restores column layout from localStorage', () => {
    localStorage.setItem('bhhb-table-column-layout', JSON.stringify({
      order: ['position', 'method', 'host', 'path', 'status', 'responselength', 'mimetype', 'extension', 'title', 'comment', 'ip', 'time'],
      hidden: ['mimetype', 'title'],
    }));

    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.displayedColumns.indexOf('method')).toBeLessThan(component.displayedColumns.indexOf('host'));
    expect(component.isColumnVisible('mimetype')).toBeFalse();
    expect(component.isColumnVisible('title')).toBeFalse();
  });

  it('persists column order after drag-and-drop', () => {
    const visible = [...component.displayedColumns];
    const hostIndex = visible.indexOf('host');
    const methodIndex = visible.indexOf('method');
    const dropEvent = {
      previousIndex: methodIndex,
      currentIndex: hostIndex,
    } as CdkDragDrop<string[]>;

    component.drop(dropEvent);

    const stored = JSON.parse(localStorage.getItem('bhhb-table-column-layout') ?? '{}');
    expect(stored.order.indexOf('host')).toBeLessThan(stored.order.indexOf('method'));
  });

  it('resetColumnLayout restores defaults', () => {
    component.toggleColumnVisibility('mimetype', false);
    component.drop({
      previousIndex: 1,
      currentIndex: 3,
    } as CdkDragDrop<string[]>);

    component.resetColumnLayout();

    expect(component.hiddenColumns.size).toBe(0);
    expect(component.columnOrder).toEqual([
      'position',
      'host',
      'method',
      'path',
      'status',
      'responselength',
      'mimetype',
      'extension',
      'title',
      'comment',
      'ip',
      'time',
    ]);
  });

  it('enters diff mode when shift-clicking another row', () => {
    const rowA = {
      position: 1,
      request: [[['GET /a HTTP/1.1', '']], ''],
      response: [[['HTTP/1.1 200', '']], 'ok'],
      comment: '',
    };
    const rowB = {
      position: 2,
      request: [[['GET /b HTTP/1.1', '']], ''],
      response: [[['HTTP/1.1 404', '']], 'missing'],
      comment: '',
    };

    component.selectRow(rowA);
    component.selectRow(rowB, { shiftKey: true } as MouseEvent);

    expect(component.compareRow).toBe(rowB);
    expect(component.diffMode).toBeTrue();
    expect(component.requestDiffLines.some((line) => line.type === 'delete')).toBeTrue();
    expect(component.requestDiffLines.some((line) => line.type === 'insert')).toBeTrue();
    expect(component.requestSideBySideRows.length).toBeGreaterThan(0);
  });

  it('switches diff layout', () => {
    component.setDiffLayout('side-by-side');
    expect(component.diffLayout).toBe('side-by-side');
  });

  it('clears compare state', () => {
    component.compareRow = { position: 2 };
    component.diffMode = true;
    component.requestDiffLines = [{ type: 'equal', text: 'x', oldLineNumber: 1, newLineNumber: 1 }];

    component.clearCompare();

    expect(component.compareRow).toBeUndefined();
    expect(component.diffMode).toBeFalse();
    expect(component.requestDiffLines.length).toBe(0);
  });

  it('captures and restores workspace filter state', () => {
    component.globalSearchTerm = 'token';
    component.columnFilters['host'] = new Set(['https://example.com']);
    component.columnFilterOptions['host'] = ['https://example.com'];
    component.clickedRow = { position: 4, request: [[], ''], response: [[], ''], comment: '' };

    const captured = component.captureViewState();

    component.globalSearchTerm = '';
    component.columnFilters['host'] = null;
    component.restoreViewState(captured);

    expect(component.globalSearchTerm).toBe('token');
    expect(component.columnFilters['host']?.has('https://example.com')).toBeTrue();
    expect(captured.selectedRowPosition).toBe(4);
  });
});