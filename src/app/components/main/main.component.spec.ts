import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { QueryList } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AngularMaterialModule } from '../../modules/angular-material/angular-material.module';
import { FileHandleService } from '../../services/file-handle/file-handle.service';
import { HttpDiffService } from '../../services/http-diff/http-diff.service';
import { RequestReplayService } from '../../services/request-replay/request-replay.service';
import { WorkspaceService } from '../../services/workspace/workspace.service';
import { HistoryIndexService } from '../../services/history-index/history-index.service';
import { HistoryRowParseService } from '../../services/history-index/history-row-parse.service';
import { InspectorPanelComponent } from '../inspector/inspector-panel.component';
import { RequestPanelComponent } from '../panels/request-panel.component';
import { ResponsePanelComponent } from '../panels/response-panel.component';
import { MainComponent } from './main.component';

describe('MainComponent', () => {
  let component: MainComponent;
  let fixture: ComponentFixture<MainComponent>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;
  let requestReplayService: jasmine.SpyObj<RequestReplayService>;

  beforeEach(async () => {
    snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);
    requestReplayService = jasmine.createSpyObj('RequestReplayService', {
      requestPartsToRaw: '',
      rawRequestToParts: [[], ''],
      rawRequestToCurl: '',
      parseRequestCookies: [{ name: 'session', value: 'abc' }],
      extractHttpHeaders: [{ key: 'Content-Type', value: 'text/html' }],
    });

    await TestBed.configureTestingModule({
      declarations: [MainComponent, InspectorPanelComponent, RequestPanelComponent, ResponsePanelComponent],
      imports: [CommonModule, AngularMaterialModule, NoopAnimationsModule],
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
        { provide: RequestReplayService, useValue: requestReplayService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MatDialog, useValue: { openDialogs: [] } },
        {
          provide: HistoryIndexService,
          useValue: {
            state$: of({ indexed: 0, total: 0, complete: true }),
            batchResults$: of([]),
            startIndexing: () => undefined,
            cancel: () => undefined,
          },
        },
        HistoryRowParseService,
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
    expect(stored.order.indexOf('method')).toBeLessThan(stored.order.indexOf('host'));
  });

  it('resetColumnLayout restores defaults', () => {
    component.toggleColumnVisibility('mimetype', false);
    component.drop({
      previousIndex: 1,
      currentIndex: 3,
    } as CdkDragDrop<string[]>);
    component.columnWidths['title'] = 420;

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
    expect(component.getColumnWidthPx('title')).toBe(200);
  });

  it('persists column widths to localStorage', () => {
    component.columnWidths['title'] = 320;
    component.columnWidths['path'] = 400;
    component['persistColumnLayout']();

    const stored = JSON.parse(localStorage.getItem('bhhb-table-column-layout') ?? '{}');
    expect(stored.widths.title).toBe(320);
    expect(stored.widths.path).toBe(400);
  });

  it('restores column widths from localStorage', () => {
    localStorage.setItem('bhhb-table-column-layout', JSON.stringify({
      widths: { title: 360, path: 500 },
    }));

    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.getColumnWidthPx('title')).toBe(360);
    expect(component.getColumnWidthPx('path')).toBe(500);
  });

  it('clamps column width during resize', () => {
    component.startColumnResize({ clientX: 100, preventDefault: () => undefined, stopPropagation: () => undefined } as MouseEvent, 'title');
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 900 }));
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(component.getColumnWidthPx('title')).toBe(800);
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

  it('filters table rows using prebuilt search index', () => {
    component.ELEMENT_DATA = [
      {
        position: 1,
        host: 'https://a.test',
        method: 'GET',
        path: '/one',
        status: '200',
        ip: '1.1.1.1',
        metadataSearchIndex: '1 1.1.1.1 https://a.test get /one 200',
        searchIndex: '1 1.1.1.1 https://a.test get /one 200 secret-body-token',
      },
      {
        position: 2,
        host: 'https://b.test',
        method: 'POST',
        path: '/two',
        status: '404',
        ip: '2.2.2.2',
        metadataSearchIndex: '2 2.2.2.2 https://b.test post /two 404',
        searchIndex: '2 2.2.2.2 https://b.test post /two 404',
      },
    ];
    component.dataSource = new MatTableDataSource(component.ELEMENT_DATA);
    (component as any).setupFilterPredicate();

    component.globalSearchTerm = 'secret-body-token';
    (component as any).refreshTableFilter();

    expect(component.dataSource.filteredData.length).toBe(1);
    expect((component.dataSource.filteredData[0] as { position: number }).position).toBe(1);
  });

  it('filters table rows from context menu action', () => {
    component.ELEMENT_DATA = [
      {
        position: 1,
        host: 'https://a.test',
        method: 'GET',
        path: '/one',
        status: '200',
        ip: '1.1.1.1',
        metadataSearchIndex: '1 https://a.test get /one 200',
        searchIndex: '1 https://a.test get /one 200',
      },
      {
        position: 2,
        host: 'https://b.test',
        method: 'POST',
        path: '/two',
        status: '404',
        ip: '2.2.2.2',
        metadataSearchIndex: '2 https://b.test post /two 404',
        searchIndex: '2 https://b.test post /two 404',
      },
    ];
    component.dataSource = new MatTableDataSource(component.ELEMENT_DATA);
    (component as any).setupFilterPredicate();
    component.contextMenuRow = component.ELEMENT_DATA[0];

    component.filterContextMenuByColumn('host');

    expect(component.columnFilters['host']?.has('https://a.test')).toBeTrue();
    expect(component.dataSource.filteredData.length).toBe(1);
  });

  it('copies a metadata field from the context menu', async () => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    component.contextMenuRow = {
      position: 3,
      comment: 'interesting',
      mimetype: 'application/json',
      time: 'Mon Jun 28 12:00:00 2026',
    };

    await component.copyContextMenuField('comment');

    expect(writeText).toHaveBeenCalledWith('interesting');
    expect(snackBar.open).toHaveBeenCalledWith('Copied Comment to clipboard', undefined, { duration: 2200 });
  });

  it('blocks native context menu on table cells', () => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    spyOn(event, 'preventDefault');

    component.onHistoryTableContextMenu(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('allows native context menu while editing a comment', () => {
    const input = document.createElement('input');
    input.className = 'comment-cell-input';
    document.body.appendChild(input);

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    spyOn(event, 'preventDefault');
    Object.defineProperty(event, 'target', { value: input, configurable: true });

    component.onHistoryTableContextMenu(event);
    component.onRowContextMenu(event, { position: 1, request: [[], ''], response: [[], ''], comment: '' });

    expect(event.preventDefault).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('auto-compares on the next row click after setting compare base', () => {
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

    component.contextMenuRow = rowA;
    component.pinContextMenuCompareBase();
    component.selectRow(rowB, new MouseEvent('click'));

    expect(component.comparePinRow).toBe(rowA);
    expect(component.clickedRow).toBe(rowB);
    expect(component.compareRow).toBe(rowA);
    expect(component.diffMode).toBeTrue();
  });

  it('compares with adjacent rows from the context menu', () => {
    const rows = [
      { position: 1, request: [[], ''], response: [[], ''], comment: '' },
      { position: 2, request: [[], ''], response: [[], ''], comment: '' },
      { position: 3, request: [[], ''], response: [[], ''], comment: '' },
    ];
    component.ELEMENT_DATA = rows;
    component.dataSource = new MatTableDataSource(rows) as typeof component.dataSource;
    component.contextMenuRow = rows[1];

    component.compareContextMenuWithAdjacent(-1);

    expect(component.clickedRow).toBe(rows[1]);
    expect(component.compareRow).toBe(rows[0]);
    expect(component.diffMode).toBeTrue();
  });

  it('prepares compare target when opening row context menu', () => {
    const rowA = { position: 1, request: [[], ''], response: [[], ''], comment: '' };
    const rowB = { position: 2, request: [[], ''], response: [[], ''], comment: '' };
    component.clickedRow = rowA;

    const event = new MouseEvent('contextmenu', { clientX: 12, clientY: 34, bubbles: true, cancelable: true });
    spyOn(event, 'preventDefault');
    spyOn(event, 'stopPropagation');
    spyOn(window, 'requestAnimationFrame').and.returnValue(0);

    component.onRowContextMenu(event, rowB);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.contextMenuPreviousSelection).toBe(rowA);
    expect(component.contextMenuRow).toBe(rowB);
    expect(component.clickedRow).toBe(rowB);
    expect(component.contextMenuPosition).toEqual({ x: 12, y: 34 });
  });

  it('clears active filter chips by id', () => {
    component.globalSearchTerm = 'token';
    component.columnFilters['host'] = new Set(['https://example.com']);
    component.columnFilters['status'] = new Set(['200']);
    component.columnTextFilterModes['path'] = 'text';
    component.columnTextFilters['path'] = '/api';
    component.timeFilterMode = 'blocked';

    component.clearFilterChip('search');
    expect(component.globalSearchTerm).toBe('');
    expect(component.activeFilterChips.some((chip) => chip.id === 'search')).toBeFalse();

    component.clearFilterChip('col:host');
    expect(component.columnFilters['host']).toBeNull();

    component.clearFilterChip('col:path');
    expect(component.getColumnTextFilterMode('path')).toBe('text');
    expect(component.getColumnTextFilter('path')).toBe('');

    component.clearFilterChip('time');
    expect(component.timeFilterMode).toBe('none');

    component.clearFilterChip('col:status');
    expect(component.columnFilters['status']).toBeNull();
    expect(component.activeFilterChips.length).toBe(0);
  });

  it('loads inspector tab data lazily on tab change', () => {
    const row = {
      position: 1,
      method: 'GET',
      url: 'https://example.com/',
      host: 'https://example.com',
      path: '/',
      request: [[['GET / HTTP/1.1', ''], ['Cookie', 'session=abc']], ''],
      response: [[['HTTP/1.1 200', '']], 'ok'],
      comment: '',
    };

    requestReplayService.parseRequestCookies.calls.reset();
    requestReplayService.extractHttpHeaders.calls.reset();

    component.selectRow(row);

    expect(component.inspectorAttributes.length).toBeGreaterThan(0);
    expect(component.inspectorRequestCookies.length).toBe(0);
    expect(component.inspectorRequestHeaders.length).toBe(0);
    expect(component.inspectorResponseHeaders.length).toBe(0);
    expect(requestReplayService.parseRequestCookies).not.toHaveBeenCalled();
    expect(requestReplayService.extractHttpHeaders).not.toHaveBeenCalled();

    component.setInspectorTab('cookies');

    expect(requestReplayService.parseRequestCookies).toHaveBeenCalled();
    expect(component.inspectorRequestCookies.length).toBe(1);
    expect(requestReplayService.extractHttpHeaders).not.toHaveBeenCalled();

    component.setInspectorTab('response-headers');

    expect(requestReplayService.extractHttpHeaders).toHaveBeenCalledTimes(1);
    expect(component.inspectorResponseHeaders.length).toBe(1);
  });

  it('truncates large response bodies until expanded', () => {
    const largeBody = 'x'.repeat(70_000);
    const row = {
      position: 1,
      request: [[['GET / HTTP/1.1', '']], ''],
      response: [[['HTTP/1.1 200', '']], largeBody],
      comment: '',
    };

    component.selectRow(row);

    expect(component.responseBodyTruncated).toBeTrue();
    expect(component.responseBodyOmittedSize).toBe(70_000 - 65_536);
    expect(component.responseHighlightedBody.length).toBeLessThan(largeBody.length);

    component.expandResponseBody();

    expect(component.responseBodyTruncated).toBeFalse();
    expect(component.responseBodyOmittedSize).toBe(0);
    expect(component.responseHighlightedBody.length).toBe(largeBody.length);
  });

  it('shows full body while panel search is active', () => {
    const largeBody = 'y'.repeat(70_000);
    const row = {
      position: 1,
      request: [[['GET / HTTP/1.1', '']], largeBody],
      response: [[['HTTP/1.1 200', '']], ''],
      comment: '',
    };

    component.selectRow(row);
    component.requestSearch = 'needle';
    (component as unknown as { updateRequestHighlights(): void }).updateRequestHighlights();

    expect(component.requestBodyTruncated).toBeFalse();
    expect(component.requestHighlightedBody.length).toBe(largeBody.length);
  });

  it('escape closes treeview before clearing row selection', () => {
    component.treeViewOpen = true;
    component.clickedRow = { position: 1, request: [[], ''], response: [[], ''], comment: '' };

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (component as unknown as { onEscapeCapture(event: KeyboardEvent): void }).onEscapeCapture(event);

    expect(component.treeViewOpen).toBeFalse();
    expect(component.clickedRow).toBeDefined();
  });

  it('escape leaves row selection when a dialog is open', () => {
    (component as unknown as { dialog: MatDialog }).dialog = { openDialogs: [{}] } as MatDialog;
    component.clickedRow = { position: 1, request: [[], ''], response: [[], ''], comment: '' };

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    spyOn(event, 'stopImmediatePropagation');
    (component as unknown as { onEscapeCapture(event: KeyboardEvent): void }).onEscapeCapture(event);

    expect(component.clickedRow).toBeDefined();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('escape closes an open menu before clearing row selection', () => {
    const closeMenu = jasmine.createSpy('closeMenu');
    const trigger = { menuOpen: true, closeMenu } as unknown as MatMenuTrigger;
    (component as unknown as { menuTriggers: QueryList<MatMenuTrigger> }).menuTriggers = {
      some: (predicate: (item: MatMenuTrigger) => boolean) => [trigger].some(predicate),
      forEach: (fn: (item: MatMenuTrigger) => void) => [trigger].forEach(fn),
    } as QueryList<MatMenuTrigger>;

    component.clickedRow = { position: 1, request: [[], ''], response: [[], ''], comment: '' };

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (component as unknown as { onEscapeCapture(event: KeyboardEvent): void }).onEscapeCapture(event);

    expect(closeMenu).toHaveBeenCalled();
    expect(component.clickedRow).toBeDefined();
  });

  it('captures and restores workspace filter state', () => {
    component.globalSearchTerm = 'token';
    component.columnFilters['host'] = new Set(['https://example.com']);
    component.columnFilterOptions['host'] = ['https://example.com'];
    component.clickedRow = { position: 4, request: [[], ''], response: [[], ''], comment: '' };

    const captured = component.captureViewState();

    component.globalSearchTerm = '';
    component.columnFilters['host'] = null;
    (component as unknown as { restoreViewState(state: typeof captured): void }).restoreViewState(captured);

    expect(component.globalSearchTerm).toBe('token');
    expect((component.columnFilters['host'] as unknown as Set<string>)?.has('https://example.com')).toBeTrue();
    expect(captured.selectedRowPosition).toBe(4);
  });
});