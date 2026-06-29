import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, ChangeDetectionStrategy } from '@angular/core';
import { FileHandleService, BurpExport, StatusBreakdown } from '../../services/file-handle/file-handle.service'
import {
  HttpHeaderRow,
  ParsedCookie,
  RequestReplayService,
} from '../../services/request-replay/request-replay.service';
import { DiffLine, HttpDiffService, SideBySideRow } from '../../services/http-diff/http-diff.service';
import { Subscription } from 'rxjs';
import {
  HistoryIndexService,
  IndexingState,
} from '../../services/history-index/history-index.service';
import {
  buildMetadataSearchIndex,
  estimateRawPayloadSize,
  extractRawPayload,
} from '../../services/history-index/history-row-search';
import { IndexedRowResult } from '../../services/history-index/history-index.types';
import { HistoryRowParseService } from '../../services/history-index/history-row-parse.service';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatMenuTrigger } from '@angular/material/menu';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

import { NestedTreeControl } from '@angular/cdk/tree';
import { MatTreeNestedDataSource } from '@angular/material/tree';
import { WorkspaceService } from '../../services/workspace/workspace.service';
import { WorkspaceViewState } from '../../services/workspace/workspace-view-state';
import { InspectorTab } from '../inspector/inspector-panel.component';

interface SiteMapNode {
  id: string;
  name: string;
  host: string;
  pathPrefix: string;
  children?: SiteMapNode[];
}

const COLUMN_LAYOUT_STORAGE_KEY = 'bhhb-table-column-layout';

const DEFAULT_COLUMN_ORDER = [
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
];

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  position: 48,
  host: 200,
  method: 72,
  path: 280,
  status: 64,
  responselength: 72,
  mimetype: 140,
  extension: 72,
  title: 200,
  comment: 160,
  ip: 120,
  time: 150,
};

const DEFAULT_COLUMN_WIDTH_LIMITS = { min: 48, max: 800 };
const LARGE_PAYLOAD_THRESHOLD = 512_000;
const COLUMN_WIDTH_LIMITS: Record<string, { min: number; max: number }> = {
  position: { min: 36, max: 80 },
  method: { min: 56, max: 160 },
  status: { min: 48, max: 120 },
  responselength: { min: 56, max: 140 },
  extension: { min: 48, max: 140 },
};

interface StoredColumnLayout {
  order?: string[];
  hidden?: string[];
  widths?: Record<string, number>;
}

@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class MainComponent implements OnInit, OnDestroy {

  constructor(
    private FileHandleService: FileHandleService,
    private requestReplayService: RequestReplayService,
    private httpDiffService: HttpDiffService,
    private workspaceService: WorkspaceService,
    private historyIndexService: HistoryIndexService,
    private historyRowParseService: HistoryRowParseService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) { }

  detailPanelLoading = false;

  fileSub!: Subscription
  beforeSaveSub!: Subscription
  private indexingStateSub?: Subscription
  private indexingBatchSub?: Subscription
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly SEARCH_DEBOUNCE_MS = 200
  indexingState: IndexingState = { indexed: 0, total: 0, complete: true }
  selectedFileContent!: BurpExport | undefined;
  private static readonly VALID_COLUMN_KEYS = new Set(DEFAULT_COLUMN_ORDER);
  columnOrder: string[] = [...DEFAULT_COLUMN_ORDER];
  hiddenColumns = new Set<string>();
  columnWidths: Record<string, number> = { ...DEFAULT_COLUMN_WIDTHS };
  private resizingColumn: string | null = null;
  private resizeStartX = 0;
  private resizeStartWidth = 0;
  private resizeMoveListener: ((event: MouseEvent) => void) | null = null;
  private resizeEndListener: (() => void) | null = null;
  readonly filterableColumnDefs = [
    { key: 'host', label: 'Host' },
    { key: 'method', label: 'Method' },
    { key: 'path', label: 'URL' },
    { key: 'status', label: 'Status' },
    { key: 'responselength', label: 'Length' },
    { key: 'mimetype', label: 'MIME type' },
    { key: 'extension', label: 'Extension' },
    { key: 'title', label: 'Title' },
    { key: 'comment', label: 'Comment' },
    { key: 'ip', label: 'IP' },
    { key: 'time', label: 'Time' },
  ];
  readonly columnVisibilityDefs = [
    { key: 'position', label: '#' },
    ...this.filterableColumnDefs,
  ];
  readonly filterableColumns = this.filterableColumnDefs.map((column) => column.key);
  dataSource = new MatTableDataSource();
  ELEMENT_DATA: any = [];
  globalSearchTerm: string = '';
  columnFilterOptions: Record<string, string[]> = {};
  columnFilters: Record<string, Set<string> | null> = {};
  activeFilterColumn: string = '';
  ipFilterMode: 'values' | 'range' | 'subnet' = 'values';
  ipRangeStart: string = '';
  ipRangeEnd: string = '';
  ipSubnet: string = '';
  ipFilterError: string = '';
  readonly textFilterColumns = ['path', 'title', 'comment'];
  columnTextFilterModes: Record<string, 'values' | 'text'> = {
    path: 'values',
    title: 'values',
    comment: 'values',
  };
  columnTextFilters: Record<string, string> = {
    path: '',
    title: '',
    comment: '',
  };
  columnTextFilterBlocked: Record<string, boolean> = {
    path: false,
    title: false,
    comment: false,
  };
  timeFilterMode: 'none' | 'absolute' | 'blocked' = 'none';
  timeAbsoluteStart: string = '';
  timeAbsoluteEnd: string = '';
  timeFilterError: string = '';
  dataTimeMinMs: number | null = null;
  dataTimeMaxMs: number | null = null;
  clickedRow!: any;
  compareRow: any | undefined;
  diffMode = false;
  diffLayout: 'unified' | 'side-by-side' = 'unified';
  requestDiffLines: DiffLine[] = [];
  responseDiffLines: DiffLine[] = [];
  requestSideBySideRows: SideBySideRow[] = [];
  responseSideBySideRows: SideBySideRow[] = [];
  replayMode = false;
  replayRequestRaw = '';
  replayRequestBaseline = '';
  editingCommentPosition: number | null = null;
  private originalRequestRaws = new Map<number, string>();
  private originalComments = new Map<number, string>();
  wrapRequest: boolean = false;
  wrapResponse: boolean = false;
  requestSearch: string = '';
  responseSearch: string = '';
  requestMatchCount: number = 0;
  responseMatchCount: number = 0;
  requestMatchIndex: number = -1;
  responseMatchIndex: number = -1;
  requestHighlightedHeaders: { key: string; value: string; hasValue: boolean }[] = [];
  requestHighlightedBody: string = '';
  responseHighlightedHeaders: { key: string; value: string; hasValue: boolean }[] = [];
  responseHighlightedBody: string = '';
  inspectorOpen = true;
  inspectorTab: InspectorTab = 'attributes';
  inspectorAttributes: Array<{ name: string; value: string }> = [];
  inspectorRequestCookies: ParsedCookie[] = [];
  inspectorRequestHeaders: HttpHeaderRow[] = [];
  inspectorResponseHeaders: HttpHeaderRow[] = [];
  treeViewOpen = false;
  treeFilter: { host: string; pathPrefix: string } | null = null;
  selectedTreeNodeId: string | null = null;
  treeControl = new NestedTreeControl<SiteMapNode>((node) => node.children);
  treeDataSource = new MatTreeNestedDataSource<SiteMapNode>();

  isDraggingFile = false;
  contextMenuRow: any | null = null;
  contextMenuPreviousSelection: any | null = null;
  comparePinRow: any | null = null;
  contextMenuPosition = { x: 0, y: 0 };

  get hasData(): boolean {
    return this.ELEMENT_DATA.length > 0;
  }

  get displayedColumns(): string[] {
    return this.columnOrder.filter((key) => !this.hiddenColumns.has(key));
  }

  get hiddenColumnCount(): number {
    return this.hiddenColumns.size;
  }

  ngOnDestroy(): void {
    this.endColumnResize();
    this.clearSearchDebounce();
    this.indexingStateSub?.unsubscribe();
    this.indexingBatchSub?.unsubscribe();
    this.historyIndexService.cancel();
    this.fileSub?.unsubscribe();
    this.beforeSaveSub?.unsubscribe();
  }

  get showIndexingStatus(): boolean {
    return this.indexingState.total > 0 && !this.indexingState.complete;
  }

  get indexingProgressPercent(): number {
    if (!this.indexingState.total) {
      return 0;
    }
    return (this.indexingState.indexed / this.indexingState.total) * 100;
  }

  ngOnInit(): void {
    this.loadColumnLayout();
    this.setupFilterPredicate();
    this.workspaceService.registerViewStateProvider(() => this.captureViewState());
    this.beforeSaveSub = this.FileHandleService.onBeforeSave()
      .subscribe(() => {
        this.flushCurrentRequestEdit();
        this.flushAllCommentEdits();
      });
    this.indexingStateSub = this.historyIndexService.state$.subscribe((state) => {
      this.indexingState = state;
    });
    this.indexingBatchSub = this.historyIndexService.batchResults$.subscribe((results) => {
      this.mergeIndexResults(results);
    });
    this.fileSub = this.FileHandleService.getselectedFileDataListener()
      .subscribe((selectedFileData: {
        selectedFileContent: BurpExport | undefined;
        viewState?: WorkspaceViewState;
      }) => {
        if (!selectedFileData.selectedFileContent) {
          this.historyIndexService.cancel();
          this.historyRowParseService.clear();
          this.dataSource = new MatTableDataSource();
          this.selectedFileContent = selectedFileData.selectedFileContent;
          this.clickedRow = undefined;
          this.clearRequestEdits();
          this.resetColumnFilters();
          this.resetTreeView();
          this.syncExportFilterState();
          return
        }
        this.clearRequestEdits();
        this.historyIndexService.cancel();
        this.historyRowParseService.clear();
        this.selectedFileContent = selectedFileData.selectedFileContent
        this.elementDataGen(this.selectedFileContent)
        this.buildSiteMapTree();
        if (selectedFileData.viewState) {
          this.restoreViewState(selectedFileData.viewState);
        } else {
          this.initializeColumnFilters();
        }
        this.dataSource = new MatTableDataSource(this.ELEMENT_DATA);
        this.dataSource.filterPredicate = this.createFilterPredicate();
        this.dataSource.sort = this.sort;
        this.refreshTableFilter();
        this.historyIndexService.startIndexing(this.ELEMENT_DATA);
        this.restoreSelectionFromViewState(selectedFileData.viewState);
      })
  }

  @ViewChild(MatSort, { static: false }) sort!: MatSort;
  @ViewChild('rowContextMenuTrigger', { static: false }) rowContextMenuTrigger!: MatMenuTrigger;
  @ViewChildren(MatMenuTrigger) private menuTriggers!: QueryList<MatMenuTrigger>;

  trackHistoryRow(_index: number, row: any): number {
    return row.position;
  }

  elementDataGen(content: any) {
    this.ELEMENT_DATA = []
    let position = 1
    const items = content?.items?.item;
    const itemList = Array.isArray(items) ? items : items ? [items] : [];
    itemList.forEach((element: any) => {
      const comment = this.normalizeXmlValue(element.comment);
      this.originalComments.set(position, comment);
      const metadata = {
        position,
        ip: element.host[0].$.ip,
        host: element.protocol + '://' + element.host[0]._ + this.portAssign(element.protocol, element.port),
        port: element.port,
        protocol: element.protocol,
        method: element.method,
        status: element.status,
        path: this.normalizeXmlValue(element.path),
        responselength: element.responselength,
        comment,
        url: element.url,
        time: this.normalizeXmlValue(element.time),
        timeMs: this.parseBurpTime(element.time),
        mimetype: element.mimetype,
        extension: element.extension != 'null' ? element.extension : '',
        title: '',
      };
      const metadataSearchIndex = buildMetadataSearchIndex(metadata);
      this.ELEMENT_DATA.push(
        {
          ...metadata,
          metadataSearchIndex,
          searchIndex: metadataSearchIndex,
          rawRequestPayload: extractRawPayload(element.request),
          rawResponsePayload: extractRawPayload(element.response),
          bodyIndexed: false,
        }
      )
      position += 1;
    });
  }

  private mergeIndexResults(results: IndexedRowResult[]): void {
    let titlesUpdated = false;

    results.forEach((result) => {
      const row = this.ELEMENT_DATA.find((entry: { position: number }) => entry.position === result.position);
      if (!row) {
        return;
      }

      if (result.title) {
        row.title = result.title;
        titlesUpdated = true;
      }
      row.searchIndex = result.bodySearchText
        ? `${row.metadataSearchIndex} ${result.bodySearchText}`
        : row.metadataSearchIndex;
      row.bodyIndexed = true;
    });

    if (titlesUpdated) {
      this.dataSource.data = this.ELEMENT_DATA.slice();
    }

    if (this.globalSearchTerm) {
      this.refreshTableFilter();
    }
  }

  private ensureRowParsed(row: any): void {
    if (!row) {
      return;
    }

    if (this.historyRowParseService.attachToRow(row)) {
      return;
    }

    if (row.request !== undefined && row.response !== undefined) {
      this.historyRowParseService.setParsed(row.position, {
        request: row.request,
        response: row.response,
        title: row.title ?? '',
        bodySearchText: '',
      });
      return;
    }

    const parsed = this.historyRowParseService.getOrParse(
      row.position,
      row.rawRequestPayload,
      row.rawResponsePayload,
    );
    row.request = parsed.request;
    row.response = parsed.response;
    if (!row.title) {
      row.title = parsed.title;
    }

    if (!row.bodyIndexed) {
      row.searchIndex = parsed.bodySearchText
        ? `${row.metadataSearchIndex} ${parsed.bodySearchText}`
        : row.metadataSearchIndex;
      row.bodyIndexed = true;
      if (this.globalSearchTerm) {
        this.refreshTableFilter();
      }
    }
  }

  private shouldDeferRowParse(row: any): boolean {
    if (this.historyRowParseService.has(row.position)) {
      return false;
    }
    return estimateRawPayloadSize(row.rawRequestPayload, row.rawResponsePayload) > LARGE_PAYLOAD_THRESHOLD;
  }

  private syncParsedRequest(position: number, request: any): void {
    const cached = this.historyRowParseService.get(position);
    if (cached) {
      cached.request = request;
    }
  }

  drop(event: CdkDragDrop<string[]>) {
    const visible = [...this.displayedColumns];
    moveItemInArray(visible, event.previousIndex, event.currentIndex);
    let visibleIndex = 0;
    this.columnOrder = this.columnOrder.map((key) => {
      if (this.hiddenColumns.has(key)) {
        return key;
      }
      return visible[visibleIndex++];
    });
    this.persistColumnLayout();
  }

  isColumnVisible(key: string): boolean {
    return !this.hiddenColumns.has(key);
  }

  toggleColumnVisibility(key: string, visible: boolean): void {
    if (visible) {
      this.hiddenColumns.delete(key);
    } else if (this.displayedColumns.length <= 1) {
      this.snackBar.open('At least one column must remain visible', undefined, { duration: 2200 });
      return;
    } else {
      this.hiddenColumns.add(key);
    }
    this.persistColumnLayout();
  }

  showAllColumns(): void {
    this.hiddenColumns.clear();
    this.persistColumnLayout();
  }

  resetColumnLayout(): void {
    this.columnOrder = [...DEFAULT_COLUMN_ORDER];
    this.hiddenColumns.clear();
    this.columnWidths = { ...DEFAULT_COLUMN_WIDTHS };
    this.persistColumnLayout();
  }

  getColumnWidthPx(key: string): number {
    return this.columnWidths[key] ?? DEFAULT_COLUMN_WIDTHS[key] ?? 140;
  }

  startColumnResize(event: MouseEvent, columnKey: string): void {
    event.preventDefault();
    event.stopPropagation();

    this.endColumnResize();
    this.resizingColumn = columnKey;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.getColumnWidthPx(columnKey);

    this.resizeMoveListener = (moveEvent: MouseEvent) => {
      if (!this.resizingColumn) {
        return;
      }
      const delta = moveEvent.clientX - this.resizeStartX;
      const nextWidth = this.clampColumnWidth(this.resizingColumn, this.resizeStartWidth + delta);
      this.columnWidths[this.resizingColumn] = nextWidth;
      this.cdr.detectChanges();
    };

    this.resizeEndListener = () => {
      const column = this.resizingColumn;
      this.endColumnResize();
      if (column) {
        this.persistColumnLayout();
      }
    };

    document.addEventListener('mousemove', this.resizeMoveListener);
    document.addEventListener('mouseup', this.resizeEndListener);
    document.body.classList.add('column-resizing');
  }

  private portAssign(protocol: any, port: any): string {
    if (protocol[0] === "https" && port[0] === "443") {
      return ''
    } else if (protocol[0] === "http" && port[0] === "80") {
      return ''
    } else {
      return ':' + port
    }
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value ?? '';
    this.clearSearchDebounce();
    this.searchDebounceTimer = setTimeout(() => {
      this.globalSearchTerm = filterValue.trim();
      this.refreshTableFilter();
      this.searchDebounceTimer = null;
    }, this.SEARCH_DEBOUNCE_MS);
  }

  private clearSearchDebounce(): void {
    if (this.searchDebounceTimer !== null) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  toggleTreeView() {
    this.treeViewOpen = !this.treeViewOpen;
    if (!this.treeViewOpen) {
      this.clearTreeFilter();
    }
  }

  hasTreeChild(_index: number, node: SiteMapNode): boolean {
    return !!node.children && node.children.length > 0;
  }

  selectTreeNode(node: SiteMapNode) {
    this.selectedTreeNodeId = node.id;
    this.treeFilter = { host: node.host, pathPrefix: node.pathPrefix };
    this.refreshTableFilter();
  }

  clearTreeFilter() {
    this.treeFilter = null;
    this.selectedTreeNodeId = null;
    this.refreshTableFilter();
  }

  setActiveFilterColumn(column: string) {
    this.activeFilterColumn = column;
    if (column === 'time' && this.timeFilterMode === 'none') {
      this.initializeTimeAbsoluteDefaults();
    }
  }

  isColumnFilterActive(column: string): boolean {
    if (column === 'ip') {
      if (this.ipFilterMode === 'range') {
        return !!(this.ipRangeStart.trim() && this.ipRangeEnd.trim());
      }
      if (this.ipFilterMode === 'subnet') {
        return !!this.ipSubnet.trim();
      }
    }
    if (column === 'time') {
      return this.timeFilterMode !== 'none';
    }
    if (this.isTextFilterColumn(column) && this.getColumnTextFilterMode(column) === 'text') {
      return !!this.getColumnTextFilter(column).trim() || !!this.columnTextFilterBlocked[column];
    }
    return this.columnFilters[column] !== null && this.columnFilters[column] !== undefined;
  }

  get showColumnFilterCheckboxes(): boolean {
    if (this.activeFilterColumn === 'ip') {
      return this.ipFilterMode === 'values';
    }
    if (this.isTextFilterColumn(this.activeFilterColumn)) {
      return this.getColumnTextFilterMode(this.activeFilterColumn) === 'values';
    }
    return this.activeFilterColumn !== 'time';
  }

  isTextFilterColumn(column: string): boolean {
    return this.textFilterColumns.includes(column);
  }

  getColumnTextFilterMode(column: string): 'values' | 'text' {
    return this.columnTextFilterModes[column] ?? 'values';
  }

  getColumnTextFilter(column: string): string {
    return this.columnTextFilters[column] ?? '';
  }

  getColumnTextFilterPlaceholder(column: string): string {
    switch (column) {
      case 'path':
        return 'e.g. /api/login';
      case 'title':
        return 'e.g. Login';
      case 'comment':
        return 'e.g. interesting';
      default:
        return '';
    }
  }

  get dataTimeRangeLabel(): string {
    if (this.dataTimeMinMs === null || this.dataTimeMaxMs === null) {
      return '';
    }
    return `${this.formatDisplayTime(this.dataTimeMinMs)} — ${this.formatDisplayTime(this.dataTimeMaxMs)}`;
  }

  get dataTimeMinLocal(): string {
    return this.dataTimeMinMs !== null ? this.msToDatetimeLocal(this.dataTimeMinMs) : '';
  }

  get dataTimeMaxLocal(): string {
    return this.dataTimeMaxMs !== null ? this.msToDatetimeLocal(this.dataTimeMaxMs) : '';
  }

  isColumnValueSelected(column: string, value: string): boolean {
    const selected = this.columnFilters[column];
    if (selected === null || selected === undefined) {
      return true;
    }
    return selected.has(value);
  }

  toggleColumnFilter(column: string, value: string, checked: boolean) {
    const allValues = this.columnFilterOptions[column] || [];
    let selected = this.columnFilters[column];

    if (selected === null || selected === undefined) {
      selected = new Set(allValues);
    }

    if (checked) {
      selected.add(value);
    } else {
      selected.delete(value);
    }

    if (selected.size === allValues.length) {
      this.columnFilters[column] = null;
    } else {
      this.columnFilters[column] = selected;
    }

    this.refreshTableFilter();
  }

  selectAllColumnFilter(column: string) {
    if (column === 'time') {
      this.resetTimeFilter();
      this.refreshTableFilter();
      return;
    }
    this.columnFilters[column] = null;
    if (column === 'ip') {
      this.resetIpAdvancedFilter();
    }
    if (this.isTextFilterColumn(column)) {
      this.resetColumnTextFilter(column);
    }
    this.refreshTableFilter();
  }

  resetColumnFilter(column: string) {
    if (column === 'time') {
      this.timeFilterMode = 'blocked';
      this.timeFilterError = '';
      this.refreshTableFilter();
      return;
    }
    if (this.isTextFilterColumn(column) && this.getColumnTextFilterMode(column) === 'text') {
      this.columnTextFilters[column] = '';
      this.columnTextFilterBlocked[column] = true;
      this.refreshTableFilter();
      return;
    }
    this.columnFilters[column] = new Set();
    if (column === 'ip') {
      this.resetIpAdvancedFilter();
    }
    if (this.isTextFilterColumn(column)) {
      this.resetColumnTextFilter(column);
    }
    this.refreshTableFilter();
  }

  setColumnTextFilterMode(column: string, mode: 'values' | 'text') {
    this.columnTextFilterModes[column] = mode;
    this.columnTextFilterBlocked[column] = false;
    if (mode === 'values') {
      this.columnTextFilters[column] = '';
    } else {
      // Entering text mode: discard previous values checkbox selection for this column
      this.columnFilters[column] = null;
    }
    this.refreshTableFilter();
  }

  onColumnTextInput(column: string, event: Event) {
    this.columnTextFilters[column] = (event.target as HTMLInputElement).value;
    this.setColumnTextFilterMode(column, 'text');
  }

  clearColumnTextFilter(column: string) {
    this.resetColumnTextFilter(column);
    this.refreshTableFilter();
  }

  onTimeAbsoluteStartInput(event: Event) {
    this.timeAbsoluteStart = (event.target as HTMLInputElement).value;
    this.timeFilterError = '';
  }

  onTimeAbsoluteEndInput(event: Event) {
    this.timeAbsoluteEnd = (event.target as HTMLInputElement).value;
    this.timeFilterError = '';
  }

  applyTimeAbsoluteFilter() {
    if (this.dataTimeMinMs === null || this.dataTimeMaxMs === null) {
      this.timeFilterError = 'No valid timestamps found in this dataset.';
      return;
    }

    const startMs = this.datetimeLocalToMs(this.timeAbsoluteStart);
    const endMs = this.datetimeLocalToMs(this.timeAbsoluteEnd);
    if (startMs === null || endMs === null) {
      this.timeFilterError = 'Start and end time are required.';
      return;
    }

    const bounds = this.clampTimeRangeToDataset(startMs, endMs);
    this.timeAbsoluteStart = this.msToDatetimeLocal(bounds.startMs);
    this.timeAbsoluteEnd = this.msToDatetimeLocal(bounds.endMs);
    this.timeFilterMode = 'absolute';
    this.timeFilterError = '';
    this.refreshTableFilter();
  }

  clearTimeFilter() {
    this.resetTimeFilter();
    this.refreshTableFilter();
  }

  setIpFilterMode(mode: 'values' | 'range' | 'subnet') {
    this.ipFilterMode = mode;
    this.ipFilterError = '';

    if (mode !== 'values') {
      // Entering advanced mode: discard any previous values checkbox selection
      this.columnFilters['ip'] = null;
    } else {
      // Switching back to values: clear advanced draft values
      this.ipRangeStart = '';
      this.ipRangeEnd = '';
      this.ipSubnet = '';
    }
    this.refreshTableFilter();
  }

  onIpRangeStartInput(event: Event) {
    this.ipRangeStart = (event.target as HTMLInputElement).value;
  }

  onIpRangeEndInput(event: Event) {
    this.ipRangeEnd = (event.target as HTMLInputElement).value;
  }

  onIpSubnetInput(event: Event) {
    this.ipSubnet = (event.target as HTMLInputElement).value;
    this.ipFilterError = '';
  }

  applyIpRangeFilter() {
    const start = this.ipRangeStart.trim();
    const end = this.ipRangeEnd.trim();
    if (!start || !end) {
      this.ipFilterError = 'Start and end IP are required.';
      return;
    }
    if (this.parseIpv4(start) === null || this.parseIpv4(end) === null) {
      this.ipFilterError = 'Enter valid IPv4 addresses.';
      return;
    }
    this.setIpFilterMode('range');
    this.ipFilterError = '';
  }

  applyIpSubnetFilter() {
    const subnet = this.ipSubnet.trim();
    if (!subnet) {
      this.ipFilterError = 'Subnet is required.';
      return;
    }
    if (this.parseCidr(subnet) === null) {
      this.ipFilterError = 'Enter a valid CIDR, e.g. 192.168.1.0/24';
      return;
    }
    this.setIpFilterMode('subnet');
    this.ipFilterError = '';
  }

  clearIpAdvancedFilter() {
    this.resetIpAdvancedFilter();
    this.refreshTableFilter();
  }

  formatFilterValue(value: string): string {
    if (!value) {
      return '(empty)';
    }
    return value.length > 60 ? `${value.slice(0, 60)}…` : value;
  }

  get activeFilterColumnLabel(): string {
    const column = this.filterableColumnDefs.find((entry) => entry.key === this.activeFilterColumn);
    return column?.label ?? '';
  }

  private setupFilterPredicate() {
    this.dataSource.filterPredicate = this.createFilterPredicate();
  }

  private createFilterPredicate() {
    return (data: any, _filter: string): boolean => {
      if (!this.matchesTreeFilter(data)) {
        return false;
      }

      if (this.globalSearchTerm) {
        const term = this.globalSearchTerm.toLowerCase();
        const searchIndex = String(data.searchIndex ?? data.metadataSearchIndex ?? '');
        if (!searchIndex.includes(term)) {
          return false;
        }
      }

      for (const column of this.filterableColumns) {
        if (column === 'ip') {
          if (!this.matchesIpFilter(String(data.ip ?? ''))) {
            return false;
          }
          continue;
        }

        if (column === 'time') {
          if (!this.matchesTimeFilter(data.timeMs)) {
            return false;
          }
          continue;
        }

        if (this.isTextFilterColumn(column)) {
          if (!this.matchesTextColumnFilter(column, String(data[column] ?? ''))) {
            return false;
          }
          continue;
        }

        const selected = this.columnFilters[column];
        if (selected !== null && selected !== undefined && !selected.has(String(data[column] ?? ''))) {
          return false;
        }
      }

      return true;
    };
  }

  private initializeColumnFilters() {
    this.resetColumnFilters();
    this.initializeDataTimeBounds();
    this.filterableColumns.forEach((column) => {
      if (column === 'time') {
        return;
      }
      const values = new Set<string>();
      this.ELEMENT_DATA.forEach((row: any) => {
        values.add(String(row[column] ?? ''));
      });
      this.columnFilterOptions[column] = Array.from(values).sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
      );
    });
  }

  private resetColumnFilters() {
    this.columnFilterOptions = {};
    this.filterableColumns.forEach((column) => {
      this.columnFilters[column] = null;
    });
    this.resetIpAdvancedFilter();
    this.resetAllColumnTextFilters();
    this.resetTimeFilter();
    this.dataTimeMinMs = null;
    this.dataTimeMaxMs = null;
  }

  private resetColumnTextFilter(column: string) {
    this.columnTextFilterModes[column] = 'values';
    this.columnTextFilters[column] = '';
    this.columnTextFilterBlocked[column] = false;
  }

  private resetAllColumnTextFilters() {
    this.textFilterColumns.forEach((column) => this.resetColumnTextFilter(column));
  }

  private matchesTextColumnFilter(column: string, value: string): boolean {
    if (this.getColumnTextFilterMode(column) === 'text') {
      if (this.columnTextFilterBlocked[column]) {
        return false;
      }
      const query = this.getColumnTextFilter(column).trim();
      if (!query) {
        return true;
      }
      return value.toLowerCase().includes(query.toLowerCase());
    }

    const selected = this.columnFilters[column];
    if (selected !== null && selected !== undefined && !selected.has(value)) {
      return false;
    }
    return true;
  }

  private resetTimeFilter() {
    this.timeFilterMode = 'none';
    this.timeFilterError = '';
    this.initializeTimeAbsoluteDefaults();
  }

  private initializeDataTimeBounds() {
    const validTimes = this.ELEMENT_DATA
      .map((row: any) => row.timeMs as number)
      .filter((timeMs: number) => Number.isFinite(timeMs));

    if (!validTimes.length) {
      this.dataTimeMinMs = null;
      this.dataTimeMaxMs = null;
      return;
    }

    this.dataTimeMinMs = Math.min(...validTimes);
    this.dataTimeMaxMs = Math.max(...validTimes);
    this.initializeTimeAbsoluteDefaults();
  }

  private initializeTimeAbsoluteDefaults() {
    if (this.dataTimeMinMs === null || this.dataTimeMaxMs === null) {
      return;
    }
    this.timeAbsoluteStart = this.msToDatetimeLocal(this.dataTimeMinMs);
    this.timeAbsoluteEnd = this.msToDatetimeLocal(this.dataTimeMaxMs);
  }

  private matchesTimeFilter(timeMs: number): boolean {
    if (this.timeFilterMode === 'none') {
      return true;
    }
    if (this.timeFilterMode === 'blocked') {
      return false;
    }
    if (!Number.isFinite(timeMs)) {
      return false;
    }

    const bounds = this.getTimeFilterBounds();
    if (!bounds) {
      return true;
    }

    return timeMs >= bounds.startMs && timeMs <= bounds.endMs;
  }

  private getTimeFilterBounds(): { startMs: number; endMs: number } | null {
    if (this.timeFilterMode !== 'absolute') {
      return null;
    }

    if (this.dataTimeMinMs === null || this.dataTimeMaxMs === null) {
      return null;
    }

    const startMs = this.datetimeLocalToMs(this.timeAbsoluteStart);
    const endMs = this.datetimeLocalToMs(this.timeAbsoluteEnd);
    if (startMs === null || endMs === null) {
      return null;
    }

    return this.clampTimeRangeToDataset(startMs, endMs);
  }

  private clampTimeRangeToDataset(startMs: number, endMs: number): { startMs: number; endMs: number } {
    const datasetMin = this.dataTimeMinMs as number;
    const datasetMax = this.dataTimeMaxMs as number;
    const orderedStart = Math.min(startMs, endMs);
    const orderedEnd = Math.max(startMs, endMs);

    return {
      startMs: Math.max(datasetMin, Math.min(orderedStart, datasetMax)),
      endMs: Math.min(datasetMax, Math.max(orderedEnd, datasetMin)),
    };
  }

  private normalizeXmlValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (Array.isArray(value)) {
      return String(value[0] ?? '').trim();
    }
    return String(value).trim();
  }

  private parseBurpTime(time: any): number {
    const raw = this.normalizeXmlValue(time);
    if (!raw) {
      return NaN;
    }

    let parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    const withoutTimezone = raw.replace(/\s[A-Za-z]{2,5}\s+/, ' ');
    parsed = Date.parse(withoutTimezone);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    const match = raw.match(/^(\w{3})\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\s+\w+)?\s+(\d{4})$/);
    if (!match) {
      return NaN;
    }

    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const month = months[match[2]];
    if (month === undefined) {
      return NaN;
    }

    return new Date(
      Number(match[7]),
      month,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6])
    ).getTime();
  }

  private msToDatetimeLocal(ms: number): string {
    const date = new Date(ms);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private datetimeLocalToMs(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  private formatDisplayTime(ms: number): string {
    return new Date(ms).toLocaleString();
  }

  private resetIpAdvancedFilter() {
    this.ipFilterMode = 'values';
    this.ipRangeStart = '';
    this.ipRangeEnd = '';
    this.ipSubnet = '';
    this.ipFilterError = '';
  }

  private matchesIpFilter(ip: string): boolean {
    if (this.ipFilterMode === 'range') {
      const start = this.ipRangeStart.trim();
      const end = this.ipRangeEnd.trim();
      if (!start || !end) {
        return true;
      }
      return this.isIpInRange(ip, start, end);
    }

    if (this.ipFilterMode === 'subnet') {
      const subnet = this.ipSubnet.trim();
      if (!subnet) {
        return true;
      }
      return this.isIpInSubnet(ip, subnet);
    }

    const selected = this.columnFilters['ip'];
    if (selected !== null && selected !== undefined && !selected.has(ip)) {
      return false;
    }
    return true;
  }

  private parseIpv4(ip: string): number | null {
    const parts = ip.trim().split('.');
    if (parts.length !== 4) {
      return null;
    }

    let result = 0;
    for (const part of parts) {
      if (!/^\d+$/.test(part)) {
        return null;
      }
      const value = Number(part);
      if (value < 0 || value > 255) {
        return null;
      }
      result = (result << 8) + value;
    }

    return result >>> 0;
  }

  private isIpInRange(ip: string, start: string, end: string): boolean {
    const ipNum = this.parseIpv4(ip);
    const startNum = this.parseIpv4(start);
    const endNum = this.parseIpv4(end);
    if (ipNum === null || startNum === null || endNum === null) {
      return false;
    }

    const min = Math.min(startNum, endNum);
    const max = Math.max(startNum, endNum);
    return ipNum >= min && ipNum <= max;
  }

  private parseCidr(cidr: string): { network: number; mask: number } | null {
    const [ipPart, prefixPart] = cidr.trim().split('/');
    if (!ipPart || prefixPart === undefined) {
      return null;
    }

    const prefix = Number(prefixPart);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return null;
    }

    const ipNum = this.parseIpv4(ipPart);
    if (ipNum === null) {
      return null;
    }

    const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
    return {
      network: (ipNum & mask) >>> 0,
      mask,
    };
  }

  private isIpInSubnet(ip: string, cidr: string): boolean {
    const ipNum = this.parseIpv4(ip);
    const cidrInfo = this.parseCidr(cidr);
    if (ipNum === null || cidrInfo === null) {
      return false;
    }

    return ((ipNum & cidrInfo.mask) >>> 0) === cidrInfo.network;
  }

  private refreshTableFilter() {
    this.dataSource.filter = `${this.globalSearchTerm}\u0000${performance.now()}`;
    this.syncExportFilterState();
  }

  private syncExportFilterState(): void {
    const totalCount = this.ELEMENT_DATA.length;
    const filteredRows = (this.dataSource.filteredData ?? []) as Array<{ position: number; host: string; status: string }>;
    const visibleCount = filteredRows.length;
    const positions = filteredRows.map((row) => row.position);
    const uniqueHosts = new Set(filteredRows.map((row) => row.host ?? '')).size;
    const statusBreakdown = this.buildStatusBreakdown(filteredRows);

    this.FileHandleService.setExportFilterState({
      totalCount,
      visibleCount,
      positions,
      isSubset: totalCount > 0 && visibleCount < totalCount,
      uniqueHosts,
      statusBreakdown,
    });
  }

  private buildStatusBreakdown(rows: Array<{ status: string }>): StatusBreakdown {
    const breakdown: StatusBreakdown = {
      success: 0,
      redirect: 0,
      clientError: 0,
      serverError: 0,
      other: 0,
    };

    rows.forEach((row) => {
      const code = Number(row.status);
      if (!Number.isFinite(code)) {
        breakdown.other += 1;
        return;
      }
      if (code >= 200 && code < 300) {
        breakdown.success += 1;
        return;
      }
      if (code >= 300 && code < 400) {
        breakdown.redirect += 1;
        return;
      }
      if (code >= 400 && code < 500) {
        breakdown.clientError += 1;
        return;
      }
      if (code >= 500 && code < 600) {
        breakdown.serverError += 1;
        return;
      }
      breakdown.other += 1;
    });

    return breakdown;
  }

  private resetTreeView() {
    this.treeViewOpen = false;
    this.clearTreeFilter();
    this.treeDataSource.data = [];
  }

  private buildSiteMapTree() {
    const hosts = new Map<string, Map<string, any>>();

    this.ELEMENT_DATA.forEach((row: any) => {
      const host = String(row.host ?? '');
      if (!host) {
        return;
      }
      if (!hosts.has(host)) {
        hosts.set(host, new Map());
      }
      const pathOnly = this.normalizePathForTree(String(row.path ?? ''));
      this.insertPathIntoBranch(hosts.get(host) as Map<string, any>, pathOnly);
    });

    const nodes: SiteMapNode[] = Array.from(hosts.keys())
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
      .map((host) => {
        const children = this.branchToSiteMapNodes(hosts.get(host) as Map<string, any>, host, '');
        return {
          id: `host:${host}`,
          name: host,
          host,
          pathPrefix: '',
          children: children.length ? children : undefined,
        };
      });

    this.treeDataSource.data = nodes;
    this.treeControl.collapseAll();
  }

  private normalizePathForTree(path: string): string {
    const pathOnly = path.split('?')[0].split('#')[0];
    if (!pathOnly || pathOnly === '/') {
      return '/';
    }
    return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  }

  private insertPathIntoBranch(branch: Map<string, any>, path: string): void {
    if (path === '/') {
      if (!branch.has('/')) {
        branch.set('/', new Map());
      }
      return;
    }

    const segments = path.split('/').filter(Boolean);
    let current: Map<string, any> = branch;
    segments.forEach((segment) => {
      if (!current.has(segment)) {
        current.set(segment, new Map());
      }
      current = current.get(segment);
    });
  }

  private branchToSiteMapNodes(branch: Map<string, any>, host: string, parentPath: string): SiteMapNode[] {
    return Array.from(branch.keys())
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
      .map((key) => {
        const pathPrefix = key === '/' ? '/' : `${parentPath}/${key}`;
        const childBranch = branch.get(key);
        const childNodes = childBranch instanceof Map
          ? this.branchToSiteMapNodes(childBranch, host, key === '/' ? '' : pathPrefix)
          : [];
        return {
          id: `node:${host}:${pathPrefix}`,
          name: key,
          host,
          pathPrefix,
          children: childNodes.length ? childNodes : undefined,
        };
      });
  }

  private matchesTreeFilter(data: any): boolean {
    if (!this.treeFilter) {
      return true;
    }

    if (data.host !== this.treeFilter.host) {
      return false;
    }

    if (!this.treeFilter.pathPrefix) {
      return true;
    }

    const pathOnly = this.normalizePathForTree(String(data.path ?? ''));
    const prefix = this.treeFilter.pathPrefix;
    if (prefix === '/') {
      return pathOnly === '/';
    }

    return pathOnly === prefix || pathOnly.startsWith(`${prefix}/`);
  }

  get contextMenuComparePreviousLabel(): string {
    if (!this.contextMenuPreviousSelection) {
      return '';
    }
    return `Compare with #${this.contextMenuPreviousSelection.position} (previous)`;
  }

  isContextMenuRowCompareBase(): boolean {
    return !!this.contextMenuRow
      && !!this.comparePinRow
      && this.contextMenuRow.position === this.comparePinRow.position;
  }

  getContextMenuAdjacentRow(offset: -1 | 1): any | null {
    const row = this.contextMenuRow;
    if (!row) {
      return null;
    }

    const rows = this.getNavigableRows();
    const index = rows.findIndex((entry) => entry === row || entry.position === row.position);
    if (index === -1) {
      return null;
    }

    const adjacentIndex = index + offset;
    if (adjacentIndex < 0 || adjacentIndex >= rows.length) {
      return null;
    }

    return rows[adjacentIndex];
  }

  onHistoryTableContextMenu(event: MouseEvent): void {
    if (this.shouldAllowNativeTableContextMenu(event)) {
      return;
    }
    event.preventDefault();
  }

  onRowContextMenu(event: MouseEvent, row: any): void {
    if (this.shouldAllowNativeTableContextMenu(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.contextMenuPreviousSelection =
      this.clickedRow && this.clickedRow !== row ? this.clickedRow : null;
    this.contextMenuRow = row;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };

    if (this.clickedRow !== row) {
      this.selectRow(row);
    }

    this.cdr.detectChanges();
    requestAnimationFrame(() => this.rowContextMenuTrigger?.openMenu());
  }

  pinContextMenuCompareBase(): void {
    if (!this.contextMenuRow) {
      return;
    }

    this.comparePinRow = this.contextMenuRow;
    this.clearCompare();
    this.snackBar.open(
      `#${this.contextMenuRow.position} set as compare base — click another row to compare`,
      undefined,
      { duration: 2800 },
    );
  }

  clearContextMenuCompareBase(): void {
    this.comparePinRow = null;
    this.clearCompare();
    this.snackBar.open('Compare base cleared', undefined, { duration: 1800 });
  }

  compareContextMenuWithPrevious(): void {
    if (!this.contextMenuRow || !this.contextMenuPreviousSelection) {
      return;
    }
    this.startRowCompare(this.contextMenuRow, this.contextMenuPreviousSelection);
  }

  compareContextMenuWithAdjacent(offset: -1 | 1): void {
    const adjacent = this.getContextMenuAdjacentRow(offset);
    if (!this.contextMenuRow || !adjacent) {
      return;
    }
    this.startRowCompare(this.contextMenuRow, adjacent);
  }

  private shouldAutoCompareWithPin(row: any, event?: MouseEvent): boolean {
    if (!event || event.shiftKey || !this.comparePinRow) {
      return false;
    }
    return row.position !== this.comparePinRow.position;
  }

  private startRowCompare(primary: any, secondary: any): void {
    this.ensureRowParsed(primary);
    this.ensureRowParsed(secondary);
    this.clickedRow = primary;
    this.applyStoredRequestEdit(primary);
    this.applyStoredCommentEdit(primary);
    this.compareRow = secondary;
    this.diffMode = true;
    if (this.replayMode) {
      this.setReplayMode(false);
    }
    this.updateRequestHighlights();
    this.updateResponseHighlights();
    this.updateInspector();
    this.updateDiffView();
    this.snackBar.open(
      `Comparing #${primary.position} with #${secondary.position}`,
      undefined,
      { duration: 2200 },
    );
  }

  filterContextMenuByColumn(column: string): void {
    const row = this.contextMenuRow;
    if (!row) {
      return;
    }

    const value = String(row[column] ?? '');
    this.filterByColumnValue(column, value);
  }

  private filterByColumnValue(column: string, value: string): void {
    if (column === 'ip') {
      this.resetIpAdvancedFilter();
    }

    if (this.isTextFilterColumn(column)) {
      this.columnTextFilterModes[column] = 'values';
      this.columnTextFilters[column] = '';
      this.columnTextFilterBlocked[column] = false;
    }

    this.columnFilters[column] = new Set([value]);
    this.refreshTableFilter();
    this.snackBar.open(
      `Filtered by ${this.getColumnDisplayLabel(column)}`,
      undefined,
      { duration: 2000 },
    );
  }

  private readonly contextMenuCopyFieldLabels: Record<string, string> = {
    url: 'URL',
    host: 'Host',
    path: 'Path',
    method: 'Method',
    status: 'Status',
    ip: 'IP',
    time: 'Time',
    mimetype: 'MIME type',
    extension: 'Extension',
    title: 'Title',
    comment: 'Comment',
    responselength: 'Response length',
    position: '#',
  };

  contextMenuFieldHasValue(field: string): boolean {
    const row = this.contextMenuRow;
    if (!row) {
      return false;
    }
    if (field === 'position') {
      return row.position != null;
    }
    const value = row[field];
    return value !== null && value !== undefined && String(value) !== '';
  }

  getContextMenuFieldPreview(field: string, maxLength = 28): string {
    const row = this.contextMenuRow;
    if (!row) {
      return '';
    }
    const value = field === 'position' ? String(row.position ?? '') : String(row[field] ?? '');
    return this.formatContextMenuValue(value, maxLength);
  }

  async copyContextMenuField(field: string): Promise<void> {
    const row = this.contextMenuRow;
    if (!row) {
      return;
    }

    const value = field === 'position' ? String(row.position ?? '') : String(row[field] ?? '');
    const label = this.contextMenuCopyFieldLabels[field] ?? field;
    await this.copyContextMenuText(value, label);
  }

  async copyContextMenuResponseRaw(): Promise<void> {
    if (!this.contextMenuRow) {
      return;
    }

    const raw = this.getRowResponseRaw(this.contextMenuRow);
    await this.copyContextMenuText(raw, 'raw response');
  }

  private async copyContextMenuText(value: string, label: string): Promise<void> {
    if (!value) {
      return;
    }

    try {
      await this.copyTextToClipboard(value);
      this.snackBar.open(`Copied ${label} to clipboard`, undefined, { duration: 2200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to copy ${label}`;
      this.snackBar.open(message, undefined, { duration: 3200 });
    }
  }

  editContextMenuComment(): void {
    if (!this.contextMenuRow) {
      return;
    }
    this.startCommentEdit(new MouseEvent('click'), this.contextMenuRow);
  }

  editContextMenuRequest(): void {
    if (!this.contextMenuRow) {
      return;
    }
    if (this.clickedRow !== this.contextMenuRow) {
      this.selectRow(this.contextMenuRow);
    }
    this.setReplayMode(true);
  }

  openContextMenuUrl(): void {
    const url = this.contextMenuRow?.url;
    if (!url) {
      return;
    }
    window.open(String(url), '_blank', 'noopener,noreferrer');
  }

  private shouldAllowNativeTableContextMenu(event: MouseEvent): boolean {
    const target = event.target as HTMLElement | null;
    return !!target?.closest('.comment-cell-input');
  }

  formatContextMenuValue(value: string, maxLength = 40): string {
    if (!value) {
      return '(empty)';
    }
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
  }

  selectRow(row: any, event?: MouseEvent) {
    if (event?.shiftKey && this.clickedRow && this.clickedRow !== row) {
      this.startRowCompare(this.clickedRow, row);
      return;
    }

    if (this.shouldAutoCompareWithPin(row, event)) {
      if (this.editingCommentPosition !== null && row.position !== this.editingCommentPosition) {
        const editingRow = this.findRowByPosition(this.editingCommentPosition);
        if (editingRow) {
          this.stopCommentEdit(editingRow);
        }
      }
      this.startRowCompare(row, this.comparePinRow);
      return;
    }

    if (this.editingCommentPosition !== null && row.position !== this.editingCommentPosition) {
      const editingRow = this.findRowByPosition(this.editingCommentPosition);
      if (editingRow) {
        this.stopCommentEdit(editingRow);
      }
    }

    if (this.clickedRow !== row) {
      this.requestSearch = '';
      this.responseSearch = '';
      this.resetRequestSearchState();
      this.resetResponseSearchState();
      this.resetReplayState();
      if (this.compareRow && this.compareRow !== row) {
        this.clearCompare();
      }
    }

    this.clickedRow = row;

    if (this.shouldDeferRowParse(row)) {
      this.detailPanelLoading = true;
      queueMicrotask(() => {
        if (this.clickedRow?.position !== row.position) {
          return;
        }
        this.completeRowSelection(row);
      });
      return;
    }

    this.completeRowSelection(row);
  }

  private completeRowSelection(row: any): void {
    this.ensureRowParsed(row);
    this.detailPanelLoading = false;
    this.applyStoredRequestEdit(row);
    this.applyStoredCommentEdit(row);
    this.updateRequestHighlights();
    this.updateResponseHighlights();
    this.updateInspector();
    this.updateDiffView();
  }

  setInspectorTab(tab: InspectorTab): void {
    this.inspectorTab = tab;
  }

  toggleInspector(): void {
    this.inspectorOpen = !this.inspectorOpen;
  }

  toggleDiffMode(): void {
    if (!this.compareRow) {
      this.snackBar.open(
        'Shift+click another row, or use Compare in the right-click menu',
        undefined,
        { duration: 3000 },
      );
      return;
    }
    this.diffMode = !this.diffMode;
    if (this.diffMode && this.replayMode) {
      this.setReplayMode(false);
    }
    this.updateDiffView();
  }

  clearCompare(): void {
    this.compareRow = undefined;
    this.diffMode = false;
    this.requestDiffLines = [];
    this.responseDiffLines = [];
    this.requestSideBySideRows = [];
    this.responseSideBySideRows = [];
  }

  setDiffLayout(layout: 'unified' | 'side-by-side'): void {
    this.diffLayout = layout;
  }

  get compareSummaryLabel(): string {
    if (!this.compareRow || !this.clickedRow) {
      return '';
    }
    return `#${this.clickedRow.position} vs #${this.compareRow.position}`;
  }

  get requestDiffStats(): string {
    return this.formatDiffStats(this.requestDiffLines);
  }

  get responseDiffStats(): string {
    return this.formatDiffStats(this.responseDiffLines);
  }

  private updateDiffView(): void {
    if (!this.diffMode || !this.clickedRow || !this.compareRow) {
      this.requestDiffLines = [];
      this.responseDiffLines = [];
      this.requestSideBySideRows = [];
      this.responseSideBySideRows = [];
      return;
    }

    const leftRequest = this.getRowRequestRaw(this.clickedRow);
    const rightRequest = this.getRowRequestRaw(this.compareRow);
    const leftResponse = this.getRowResponseRaw(this.clickedRow);
    const rightResponse = this.getRowResponseRaw(this.compareRow);

    this.requestDiffLines = this.httpDiffService.diffLines(leftRequest, rightRequest);
    this.responseDiffLines = this.httpDiffService.diffLines(leftResponse, rightResponse);
    this.requestSideBySideRows = this.httpDiffService.toSideBySide(this.requestDiffLines);
    this.responseSideBySideRows = this.httpDiffService.toSideBySide(this.responseDiffLines);
  }

  private getRowRequestRaw(row: any): string {
    this.ensureRowParsed(row);
    const editedRaw = this.FileHandleService.getRequestEdit(row.position);
    if (editedRaw) {
      return editedRaw;
    }
    return this.httpDiffService.partsToRaw(row.request);
  }

  private getRowResponseRaw(row: any): string {
    this.ensureRowParsed(row);
    return this.httpDiffService.partsToRaw(row.response);
  }

  private formatDiffStats(lines: DiffLine[]): string {
    const inserts = lines.filter((line) => line.type === 'insert').length;
    const deletes = lines.filter((line) => line.type === 'delete').length;
    if (!inserts && !deletes) {
      return 'No differences';
    }
    return `+${inserts} / -${deletes}`;
  }

  parseNoteTags(note: string): string[] {
    if (!note) {
      return [];
    }
    return note
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  isCommentEditing(element: any): boolean {
    return this.editingCommentPosition === element.position;
  }

  commentIsEdited(element: any): boolean {
    return this.FileHandleService.hasCommentEdit(element.position);
  }

  startCommentEdit(event: Event, element: any): void {
    event.stopPropagation();
    if (this.clickedRow !== element) {
      this.selectRow(element);
    }
    this.editingCommentPosition = element.position;
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      const input = document.getElementById(`comment-input-${element.position}`) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  persistCommentEdit(element: any): void {
    this.flushCommentEdit(element);
    this.refreshTableFilter();
  }

  stopCommentEdit(element: any): void {
    if (this.editingCommentPosition !== element.position) {
      return;
    }
    this.flushCommentEdit(element);
    this.editingCommentPosition = null;
  }

  get replayRequestDirty(): boolean {
    return this.replayRequestRaw !== this.replayRequestBaseline;
  }

  get requestIsEdited(): boolean {
    const position = this.clickedRow?.position;
    return position ? this.FileHandleService.hasRequestEdit(position) : false;
  }

  setReplayMode(enabled: boolean): void {
    if (!enabled && this.replayMode) {
      if (!this.commitRequestEdits()) {
        return;
      }
    }
    this.replayMode = enabled;
    if (enabled) {
      this.diffMode = false;
      this.loadReplayRequest();
    }
  }

  showRequestView(): void {
    if (this.replayMode) {
      this.setReplayMode(false);
      return;
    }
    this.diffMode = false;
    this.updateDiffView();
  }

  persistReplayRequest(): void {
    if (!this.clickedRow || !this.replayMode) {
      return;
    }
    if (this.replayRequestRaw === this.replayRequestBaseline) {
      this.FileHandleService.setRequestEdit(this.clickedRow.position, null);
      return;
    }
    this.FileHandleService.setRequestEdit(this.clickedRow.position, this.replayRequestRaw);
  }

  resetReplayRequest(): void {
    const position = this.clickedRow?.position;
    if (!position || !this.originalRequestRaws.has(position)) {
      return;
    }
    const original = this.originalRequestRaws.get(position)!;
    this.replayRequestRaw = original;
    this.FileHandleService.setRequestEdit(position, null);
    this.clickedRow.request = this.requestReplayService.rawRequestToParts(original);
    this.syncParsedRequest(position, this.clickedRow.request);
    this.updateRequestHighlights();
    this.updateInspector();
  }

  async copyRequestAsCurl(): Promise<void> {
    if (!this.clickedRow) {
      return;
    }

    if (this.replayMode && !this.commitRequestEdits()) {
      return;
    }

    try {
      const raw = this.getActiveRequestRaw();
      const curl = this.requestReplayService.rawRequestToCurl(
        raw,
        this.clickedRow.host,
        this.clickedRow.url,
      );
      await this.copyTextToClipboard(curl);
      this.snackBar.open('Copied cURL to clipboard', undefined, { duration: 2200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to build cURL';
      this.snackBar.open(message, undefined, { duration: 3200 });
    }
  }

  async copyRequestRaw(): Promise<void> {
    if (!this.clickedRow) {
      return;
    }

    if (this.replayMode && !this.commitRequestEdits()) {
      return;
    }

    try {
      const raw = this.getActiveRequestRaw();
      await this.copyTextToClipboard(raw);
      this.snackBar.open('Copied raw request to clipboard', undefined, { duration: 2200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy request';
      this.snackBar.open(message, undefined, { duration: 3200 });
    }
  }

  private getActiveRequestRaw(): string {
    if (this.replayMode) {
      return this.replayRequestRaw;
    }
    const position = this.clickedRow?.position;
    const editedRaw = position ? this.FileHandleService.getRequestEdit(position) : undefined;
    if (editedRaw) {
      return editedRaw;
    }
    return this.requestReplayService.requestPartsToRaw(this.clickedRow.request);
  }

  private loadReplayRequest(): void {
    if (!this.clickedRow?.request) {
      this.replayRequestRaw = '';
      this.replayRequestBaseline = '';
      return;
    }

    const position = this.clickedRow.position;
    if (!this.originalRequestRaws.has(position)) {
      this.originalRequestRaws.set(
        position,
        this.requestReplayService.requestPartsToRaw(this.clickedRow.request),
      );
    }

    this.replayRequestBaseline = this.originalRequestRaws.get(position)!;
    this.replayRequestRaw = this.FileHandleService.getRequestEdit(position) ?? this.replayRequestBaseline;
  }

  private commitRequestEdits(): boolean {
    if (!this.clickedRow) {
      return true;
    }

    if (!this.replayRequestDirty) {
      this.FileHandleService.setRequestEdit(this.clickedRow.position, null);
      if (this.originalRequestRaws.has(this.clickedRow.position)) {
        this.clickedRow.request = this.requestReplayService.rawRequestToParts(
          this.originalRequestRaws.get(this.clickedRow.position)!,
        );
        this.syncParsedRequest(this.clickedRow.position, this.clickedRow.request);
        this.updateRequestHighlights();
        this.updateInspector();
      }
      return true;
    }

    try {
      this.clickedRow.request = this.requestReplayService.rawRequestToParts(this.replayRequestRaw);
      this.syncParsedRequest(this.clickedRow.position, this.clickedRow.request);
      this.FileHandleService.setRequestEdit(this.clickedRow.position, this.replayRequestRaw);
      this.updateRequestHighlights();
      this.updateInspector();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid HTTP request';
      this.snackBar.open(message, undefined, { duration: 3200 });
      return false;
    }
  }

  private applyStoredRequestEdit(row: any): void {
    const editedRaw = this.FileHandleService.getRequestEdit(row.position);
    if (!editedRaw) {
      return;
    }
    try {
      row.request = this.requestReplayService.rawRequestToParts(editedRaw);
      this.syncParsedRequest(row.position, row.request);
    } catch (error) {
      console.warn('Stored request edit could not be applied', error);
    }
  }

  private applyStoredCommentEdit(row: any): void {
    const editedComment = this.FileHandleService.getCommentEdit(row.position);
    if (editedComment === undefined) {
      return;
    }
    row.comment = editedComment;
  }

  private flushCommentEdit(row: any): void {
    const position = row.position;
    const baseline = this.originalComments.get(position) ?? '';
    const current = row.comment ?? '';
    if (current === baseline) {
      this.FileHandleService.setCommentEdit(position, null);
      return;
    }
    this.FileHandleService.setCommentEdit(position, current);
  }

  private flushAllCommentEdits(): void {
    if (this.editingCommentPosition !== null) {
      const editingRow = this.findRowByPosition(this.editingCommentPosition);
      if (editingRow) {
        this.flushCommentEdit(editingRow);
      }
      this.editingCommentPosition = null;
    }
    this.ELEMENT_DATA.forEach((row: any) => this.flushCommentEdit(row));
  }

  private findRowByPosition(position: number): any | undefined {
    return this.ELEMENT_DATA.find((row: any) => row.position === position);
  }

  private clearRequestEdits(): void {
    this.FileHandleService.clearEdits();
    this.originalRequestRaws.clear();
    this.originalComments.clear();
    this.editingCommentPosition = null;
    this.replayRequestRaw = '';
    this.replayRequestBaseline = '';
    this.replayMode = false;
    this.comparePinRow = null;
    this.clearCompare();
  }

  private flushCurrentRequestEdit(): void {
    if (!this.clickedRow || !this.replayMode) {
      return;
    }
    if (this.replayRequestRaw === this.replayRequestBaseline) {
      this.FileHandleService.setRequestEdit(this.clickedRow.position, null);
      return;
    }
    this.FileHandleService.setRequestEdit(this.clickedRow.position, this.replayRequestRaw);
    try {
      this.clickedRow.request = this.requestReplayService.rawRequestToParts(this.replayRequestRaw);
      this.syncParsedRequest(this.clickedRow.position, this.clickedRow.request);
    } catch (error) {
      console.warn('Pending request edit could not be applied before export', error);
    }
  }

  private resetReplayState(): void {
    this.replayMode = false;
    this.replayRequestRaw = '';
    this.replayRequestBaseline = '';
  }

  private async copyTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!copied) {
      throw new Error('Clipboard is unavailable in this browser.');
    }
  }

  onRequestSearch(event: Event) {
    this.requestSearch = (event.target as HTMLInputElement).value;
    this.requestMatchCount = this.countPanelMatches(this.clickedRow?.request, this.requestSearch);
    this.requestMatchIndex = this.requestMatchCount > 0 ? 0 : -1;
    this.updateRequestHighlights();
    this.scheduleScrollToMatch('request');
  }

  onResponseSearch(event: Event) {
    this.responseSearch = (event.target as HTMLInputElement).value;
    this.responseMatchCount = this.countPanelMatches(this.clickedRow?.response, this.responseSearch);
    this.responseMatchIndex = this.responseMatchCount > 0 ? 0 : -1;
    this.updateResponseHighlights();
    this.scheduleScrollToMatch('response');
  }

  onRequestSearchKeydown(event: KeyboardEvent) {
    this.onPanelSearchKeydown(event, 'request');
  }

  onResponseSearchKeydown(event: KeyboardEvent) {
    this.onPanelSearchKeydown(event, 'response');
  }

  private onPanelSearchKeydown(event: KeyboardEvent, panel: 'request' | 'response') {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.navigatePanelMatch(panel, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.navigatePanelMatch(panel, -1);
    }
  }

  private navigatePanelMatch(panel: 'request' | 'response', direction: 1 | -1) {
    const matchCount = panel === 'request' ? this.requestMatchCount : this.responseMatchCount;
    if (matchCount === 0) {
      return;
    }

    if (panel === 'request') {
      this.requestMatchIndex = (this.requestMatchIndex + direction + matchCount) % matchCount;
      this.updateRequestHighlights();
    } else {
      this.responseMatchIndex = (this.responseMatchIndex + direction + matchCount) % matchCount;
      this.updateResponseHighlights();
    }

    this.scheduleScrollToMatch(panel);
  }

  private updateRequestHighlights() {
    if (!this.clickedRow) {
      this.requestHighlightedHeaders = [];
      this.requestHighlightedBody = '';
      return;
    }

    const state = { index: 0 };
    const activeIndex = this.requestMatchIndex;
    this.requestHighlightedHeaders = this.clickedRow.request[0].map((row: [string, string]) => ({
      key: this.highlightTextWithIndex(row[0], this.requestSearch, state, activeIndex),
      value: this.highlightTextWithIndex(row[1], this.requestSearch, state, activeIndex),
      hasValue: !!row[1],
    }));
    this.requestHighlightedBody = this.highlightTextWithIndex(
      this.clickedRow.request[1],
      this.requestSearch,
      state,
      activeIndex
    );
  }

  private updateResponseHighlights() {
    if (!this.clickedRow) {
      this.responseHighlightedHeaders = [];
      this.responseHighlightedBody = '';
      return;
    }

    const state = { index: 0 };
    const activeIndex = this.responseMatchIndex;
    this.responseHighlightedHeaders = this.clickedRow.response[0].map((row: [string, string]) => ({
      key: this.highlightTextWithIndex(row[0], this.responseSearch, state, activeIndex),
      value: this.highlightTextWithIndex(row[1], this.responseSearch, state, activeIndex),
      hasValue: !!row[1],
    }));
    this.responseHighlightedBody = this.highlightTextWithIndex(
      this.clickedRow.response[1],
      this.responseSearch,
      state,
      activeIndex
    );
  }

  private updateInspector(): void {
    if (!this.clickedRow) {
      this.inspectorAttributes = [];
      this.inspectorRequestCookies = [];
      this.inspectorRequestHeaders = [];
      this.inspectorResponseHeaders = [];
      return;
    }

    const row = this.clickedRow;
    this.inspectorAttributes = [
      { name: 'Method', value: row.method ?? '' },
      { name: 'URL', value: row.url ?? '' },
      { name: 'Host', value: row.host ?? '' },
      { name: 'Path', value: row.path ?? '' },
      { name: 'Protocol', value: row.protocol ?? '' },
      { name: 'Port', value: row.port ?? '' },
      { name: 'IP', value: row.ip ?? '' },
      { name: 'Time', value: row.time ?? '' },
      { name: 'Status', value: row.status ?? '' },
      { name: 'Length', value: row.responselength ?? '' },
      { name: 'MIME type', value: row.mimetype ?? '' },
      { name: 'Extension', value: row.extension ?? '' },
      { name: 'Title', value: row.title ?? '' },
    ].filter((entry) => entry.value !== '' && entry.value !== undefined && entry.value !== null);

    const requestHeaders = row.request?.[0] as Array<[string, string]> | undefined;
    const responseHeaders = row.response?.[0] as Array<[string, string]> | undefined;

    this.inspectorRequestCookies = requestHeaders
      ? this.requestReplayService.parseRequestCookies(requestHeaders)
      : [];
    this.inspectorRequestHeaders = requestHeaders
      ? this.requestReplayService.extractHttpHeaders(requestHeaders)
      : [];
    this.inspectorResponseHeaders = responseHeaders
      ? this.requestReplayService.extractHttpHeaders(responseHeaders)
      : [];
  }

  private countPanelMatches(panelContent: any, search: string): number {
    if (!panelContent) {
      return 0;
    }

    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      return 0;
    }

    let count = 0;
    panelContent[0].forEach((row: [string, string]) => {
      count += this.countMatchesInText(row[0], trimmedSearch);
      count += this.countMatchesInText(row[1], trimmedSearch);
    });
    count += this.countMatchesInText(panelContent[1] as string, trimmedSearch);
    return count;
  }

  private countMatchesInText(text: string, search: string): number {
    if (!text) {
      return 0;
    }
    const regex = this.buildSearchRegex(search);
    if (!regex) {
      return 0;
    }
    return (text.match(regex) || []).length;
  }

  private highlightTextWithIndex(
    text: string,
    search: string,
    state: { index: number },
    activeIndex: number
  ): string {
    if (!text) {
      return '';
    }

    const escapedText = this.escapeHtml(text);
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      return escapedText;
    }

    const regex = this.buildSearchRegex(trimmedSearch);
    if (!regex) {
      return escapedText;
    }

    return escapedText.replace(regex, (match) => {
      const matchIndex = state.index++;
      const isActive = matchIndex === activeIndex;
      const classes = isActive ? 'search-highlight search-highlight-active' : 'search-highlight';
      return `<mark class="${classes}" data-match-index="${matchIndex}">${match}</mark>`;
    });
  }

  private buildSearchRegex(search: string): RegExp | null {
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      return null;
    }
    const escapedSearch = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escapedSearch, 'gi');
  }

  private scheduleScrollToMatch(panel: 'request' | 'response') {
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.scrollToActiveMatch(panel));
    });
  }

  private scrollToActiveMatch(panel: 'request' | 'response') {
    const contentId = panel === 'request' ? 'request-content' : 'response-content';
    const activeIndex = panel === 'request' ? this.requestMatchIndex : this.responseMatchIndex;
    const container = document.getElementById(contentId);
    if (!container || activeIndex < 0) {
      return;
    }

    const activeMark = container.querySelector('mark.search-highlight-active') as HTMLElement | null;
    if (!activeMark) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const markRect = activeMark.getBoundingClientRect();
    const deltaY = markRect.top - containerRect.top;
    const deltaX = markRect.left - containerRect.left;

    const targetScrollTop = container.scrollTop + deltaY - (container.clientHeight / 2) + (markRect.height / 2);
    const targetScrollLeft = container.scrollLeft + deltaX - (container.clientWidth / 2) + (markRect.width / 2);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      left: Math.max(0, targetScrollLeft),
      behavior: 'smooth',
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private resetRequestSearchState() {
    this.requestMatchCount = 0;
    this.requestMatchIndex = -1;
    this.requestHighlightedHeaders = [];
    this.requestHighlightedBody = '';
  }

  private resetResponseSearchState() {
    this.responseMatchCount = 0;
    this.responseMatchIndex = -1;
    this.responseHighlightedHeaders = [];
    this.responseHighlightedBody = '';
  }

  private clearPanelSearches() {
    this.requestSearch = '';
    this.responseSearch = '';
    this.resetRequestSearchState();
    this.resetResponseSearchState();
    const requestSearchInput = document.getElementById('request-search') as HTMLInputElement | null;
    const responseSearchInput = document.getElementById('response-search') as HTMLInputElement | null;
    if (requestSearchInput) {
      requestSearchInput.value = '';
    }
    if (responseSearchInput) {
      responseSearchInput.value = '';
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.handleEscapeKey(event)) {
        return;
      }
    }

    if (this.shouldIgnoreKeyboardShortcut(event)) {
      return;
    }

    const focusGlobalSearchShortcut =
      (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === '/')
      || ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'f');
    if (focusGlobalSearchShortcut) {
      event.preventDefault();
      this.focusGlobalSearch();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.clearAllFilters();
      this.snackBar.open('Filters cleared', undefined, { duration: 1800 });
      return;
    }

    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === 't') {
        event.preventDefault();
        if (event.shiftKey) {
          if (this.treeFilter) {
            this.clearTreeFilter();
          }
        } else if (this.hasData) {
          this.toggleTreeView();
        }
        return;
      }

      if (event.key === 'r' && this.clickedRow) {
        event.preventDefault();
        this.focusRequestSearch();
        return;
      }

      if (event.key === 'e' && this.clickedRow) {
        event.preventDefault();
        this.focusResponseSearch();
        return;
      }

      if (event.key === 'n' && this.clickedRow) {
        event.preventDefault();
        this.startCommentEdit(event, this.clickedRow);
        return;
      }
    }

    if (!this.hasData) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateRow(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateRow(-1);
        break;
      case 'Home':
        event.preventDefault();
        this.navigateRow('first');
        break;
      case 'End':
        event.preventDefault();
        this.navigateRow('last');
        break;
      case 'PageDown':
        event.preventDefault();
        this.navigateRow(10);
        break;
      case 'PageUp':
        event.preventDefault();
        this.navigateRow(-10);
        break;
      case 'Enter':
        event.preventDefault();
        if (event.shiftKey) {
          this.openResponsePanel();
        } else {
          this.openRequestPanel();
        }
        break;
    }
  }

  private handleEscapeKey(event: KeyboardEvent): boolean {
    if (this.editingCommentPosition !== null) {
      event.preventDefault();
      const editingRow = this.findRowByPosition(this.editingCommentPosition);
      if (editingRow) {
        this.stopCommentEdit(editingRow);
      }
      return true;
    }

    if (this.replayMode) {
      event.preventDefault();
      this.setReplayMode(false);
      return true;
    }

    if (this.diffMode || this.compareRow) {
      event.preventDefault();
      this.clearCompare();
      return true;
    }

    if (this.comparePinRow) {
      event.preventDefault();
      this.clearContextMenuCompareBase();
      return true;
    }

    if (this.clickedRow) {
      event.preventDefault();
      this.clickedRow = undefined;
      this.clearPanelSearches();
      return true;
    }

    const searchInput = document.getElementById('search') as HTMLInputElement | null;
    if (searchInput?.value) {
      event.preventDefault();
      searchInput.value = '';
      this.applyFilter(event);
      return true;
    }

    if (this.hasActiveFilters()) {
      event.preventDefault();
      this.clearAllFilters();
      return true;
    }

    return false;
  }

  private shouldIgnoreKeyboardShortcut(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return false;
    }

    if (target.closest('.mat-dialog-container, .mat-menu-panel, .cdk-overlay-container .mat-datepicker-content')) {
      return true;
    }

    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
      return true;
    }

    if (tag === 'INPUT') {
      const inputType = (target as HTMLInputElement).type;
      if (inputType !== 'checkbox' && inputType !== 'radio') {
        return true;
      }
    }

    return false;
  }

  private getNavigableRows(): any[] {
    const filtered = (this.dataSource.filteredData ?? []) as any[];
    if (this.sort) {
      return this.dataSource.sortData(filtered, this.sort);
    }
    return filtered;
  }

  private navigateRow(direction: 1 | -1 | 10 | -10 | 'first' | 'last'): void {
    const rows = this.getNavigableRows();
    if (!rows.length) {
      return;
    }

    if (this.editingCommentPosition !== null) {
      const editingRow = this.findRowByPosition(this.editingCommentPosition);
      if (editingRow) {
        this.stopCommentEdit(editingRow);
      }
    }

    let index = this.clickedRow
      ? rows.findIndex((row) => row === this.clickedRow || row.position === this.clickedRow.position)
      : -1;

    if (direction === 'first') {
      index = 0;
    } else if (direction === 'last') {
      index = rows.length - 1;
    } else if (index === -1) {
      index = direction > 0 ? 0 : rows.length - 1;
    } else {
      index = Math.max(0, Math.min(rows.length - 1, index + direction));
    }

    this.selectRow(rows[index]);
    this.scrollRowIntoView(rows[index]);
  }

  private openRequestPanel(): void {
    const rows = this.getNavigableRows();
    if (!this.clickedRow && rows.length) {
      this.selectRow(rows[0]);
    }
    if (!this.clickedRow) {
      return;
    }

    if (this.replayMode) {
      this.setReplayMode(false);
    }

    this.focusRequestSearch();
  }

  private openResponsePanel(): void {
    const rows = this.getNavigableRows();
    if (!this.clickedRow && rows.length) {
      this.selectRow(rows[0]);
    }
    if (!this.clickedRow) {
      return;
    }

    if (this.replayMode) {
      this.setReplayMode(false);
    }

    this.focusResponseSearch();
  }

  private focusGlobalSearch(): void {
    const searchInput = document.getElementById('search') as HTMLInputElement | null;
    searchInput?.focus();
    searchInput?.select();
  }

  private focusRequestSearch(): void {
    requestAnimationFrame(() => {
      const input = document.getElementById('request-search') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  private focusResponseSearch(): void {
    requestAnimationFrame(() => {
      const input = document.getElementById('response-search') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  clearGlobalSearch(): void {
    this.clearSearchDebounce();
    this.resetGlobalSearchTerm();
    this.refreshTableFilter();
  }

  private resetGlobalSearchTerm(): void {
    this.clearSearchDebounce();
    this.globalSearchTerm = '';
    const searchInput = document.getElementById('search') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.value = '';
    }
  }

  clearAllFilters(): void {
    this.resetGlobalSearchTerm();

    if (this.hasData) {
      this.initializeColumnFilters();
    } else {
      this.resetColumnFilters();
    }

    if (this.treeFilter) {
      this.clearTreeFilter();
    } else {
      this.refreshTableFilter();
    }
  }

  get activeFilterChips(): Array<{ id: string; label: string }> {
    const chips: Array<{ id: string; label: string }> = [];

    // Global search
    const term = this.globalSearchTerm.trim();
    if (term) {
      const short = term.length > 18 ? term.slice(0, 15) + '…' : term;
      chips.push({
        id: 'search',
        label: `Search: "${short}"`,
      });
    }

    // Tree / site map filter
    if (this.treeFilter) {
      let desc = this.treeFilter.host.replace(/^https?:\/\//, '');
      if (this.treeFilter.pathPrefix && this.treeFilter.pathPrefix !== '/') {
        desc += this.treeFilter.pathPrefix;
      }
      chips.push({
        id: 'tree',
        label: `Tree: ${desc}`,
      });
    }

    // Time filter
    if (this.timeFilterMode === 'absolute') {
      const start = this.formatTimeForChip(this.timeAbsoluteStart);
      const end = this.formatTimeForChip(this.timeAbsoluteEnd);
      chips.push({
        id: 'time',
        label: `Time: ${start} — ${end}`,
      });
    } else if (this.timeFilterMode === 'blocked') {
      chips.push({
        id: 'time',
        label: `Time: none`,
      });
    }

    // IP filter
    if (this.ipFilterMode === 'range' && this.ipRangeStart.trim() && this.ipRangeEnd.trim()) {
      chips.push({
        id: 'ip',
        label: `IP: ${this.ipRangeStart.trim()}–${this.ipRangeEnd.trim()}`,
      });
    } else if (this.ipFilterMode === 'subnet' && this.ipSubnet.trim()) {
      chips.push({
        id: 'ip',
        label: `IP: ${this.ipSubnet.trim()}`,
      });
    } else {
      const ipSel = this.columnFilters['ip'];
      if (ipSel !== null && ipSel !== undefined) {
        const count = ipSel.size;
        chips.push({
          id: 'ip',
          label: `IP: ${count} selected`,
        });
      }
    }

    // Column filters (value sets and text advanced)
    for (const column of this.filterableColumns) {
      if (column === 'ip' || column === 'time') {
        continue;
      }
      const colLabel = this.getColumnDisplayLabel(column);

      if (this.isTextFilterColumn(column) && this.getColumnTextFilterMode(column) === 'text') {
        if (this.columnTextFilterBlocked[column]) {
          chips.push({
            id: `col:${column}`,
            label: `${colLabel}: (none)`,
          });
        } else {
          const q = this.getColumnTextFilter(column).trim();
          if (q) {
            const short = q.length > 16 ? q.slice(0, 13) + '…' : q;
            chips.push({
              id: `col:${column}`,
              label: `${colLabel} contains "${short}"`,
            });
          }
        }
      } else {
        const sel = this.columnFilters[column];
        if (sel !== null && sel !== undefined) {
          const values = Array.from(sel);
          let valDisplay: string;
          if (values.length === 0) {
            valDisplay = '(none)';
          } else if (values.length <= 2) {
            valDisplay = values.map(v => this.formatChipValue(v)).join(', ');
          } else {
            valDisplay = `${this.formatChipValue(values[0])}, ${this.formatChipValue(values[1])} +${values.length - 2}`;
          }
          chips.push({
            id: `col:${column}`,
            label: `${colLabel}: ${valDisplay}`,
          });
        }
      }
    }

    return chips;
  }

  trackFilterChip(_index: number, chip: { id: string }): string {
    return chip.id;
  }

  clearFilterChip(chipId: string, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.closeOpenFilterMenus();

    switch (chipId) {
      case 'search':
        this.clearGlobalSearch();
        return;
      case 'tree':
        this.clearTreeFilter();
        return;
      case 'time':
        this.clearTimeFilter();
        return;
      case 'ip':
        this.selectAllColumnFilter('ip');
        return;
      default:
        if (chipId.startsWith('col:')) {
          const column = chipId.slice(4);
          if (this.filterableColumns.includes(column)) {
            this.selectAllColumnFilter(column);
          }
        }
    }
  }

  private closeOpenFilterMenus(): void {
    this.menuTriggers?.forEach((trigger) => {
      if (trigger.menuOpen) {
        trigger.closeMenu();
      }
    });
  }

  private getColumnDisplayLabel(key: string): string {
    const def = this.filterableColumnDefs.find((d) => d.key === key);
    return def ? def.label : key;
  }

  private formatTimeForChip(value: string): string {
    if (!value) return '';
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (match) {
      return `${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
    }
    const parts = value.split('T');
    return parts[0] || value;
  }

  private formatChipValue(value: string): string {
    if (!value) return '(empty)';
    return value.length > 12 ? value.slice(0, 9) + '…' : value;
  }

  private hasActiveFilters(): boolean {
    return this.activeFilterChips.length > 0;
  }

  private scrollRowIntoView(row: any): void {
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      const rowElement = document.querySelector(`tr.mat-row[data-row-position="${row.position}"], tr.mat-mdc-row[data-row-position="${row.position}"]`);
      rowElement?.scrollIntoView({ block: 'nearest' });
    });
  }

  private loadColumnLayout(): void {
    try {
      const raw = localStorage.getItem(COLUMN_LAYOUT_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const stored = JSON.parse(raw) as StoredColumnLayout;
      const validKeys = MainComponent.VALID_COLUMN_KEYS;

      if (Array.isArray(stored.order)) {
        const order = stored.order.filter((key) => validKeys.has(key));
        const missing = DEFAULT_COLUMN_ORDER.filter((key) => !order.includes(key));
        this.columnOrder = [...order, ...missing];
      }

      if (Array.isArray(stored.hidden)) {
        this.hiddenColumns = new Set(stored.hidden.filter((key) => validKeys.has(key)));
        if (this.columnOrder.every((key) => this.hiddenColumns.has(key))) {
          this.hiddenColumns.delete('position');
        }
      }

      if (stored.widths && typeof stored.widths === 'object') {
        Object.entries(stored.widths).forEach(([key, width]) => {
          if (!validKeys.has(key) || typeof width !== 'number' || !Number.isFinite(width)) {
            return;
          }
          this.columnWidths[key] = this.clampColumnWidth(key, width);
        });
      }
    } catch {
      // Ignore corrupt storage and keep defaults.
    }
  }

  private persistColumnLayout(): void {
    try {
      localStorage.setItem(COLUMN_LAYOUT_STORAGE_KEY, JSON.stringify({
        order: this.columnOrder,
        hidden: Array.from(this.hiddenColumns),
        widths: this.columnWidths,
      }));
    } catch {
      // Ignore quota errors.
    }
  }

  private clampColumnWidth(key: string, width: number): number {
    const limits = COLUMN_WIDTH_LIMITS[key] ?? DEFAULT_COLUMN_WIDTH_LIMITS;
    return Math.max(limits.min, Math.min(limits.max, Math.round(width)));
  }

  private endColumnResize(): void {
    if (this.resizeMoveListener) {
      document.removeEventListener('mousemove', this.resizeMoveListener);
      this.resizeMoveListener = null;
    }
    if (this.resizeEndListener) {
      document.removeEventListener('mouseup', this.resizeEndListener);
      this.resizeEndListener = null;
    }
    this.resizingColumn = null;
    document.body.classList.remove('column-resizing');
  }

  // --- File drop support (for receiving exports from Burp extension etc.) ---
  private dragCounter = 0;

  @HostListener('document:dragenter', ['$event'])
  onDragEnter(event: DragEvent): void {
    if (this.hasFileDataTransfer(event)) {
      event.preventDefault();
      this.dragCounter++;
      this.isDraggingFile = true;
    }
  }

  @HostListener('document:dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    if (this.hasFileDataTransfer(event)) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    }
  }

  @HostListener('document:dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    if (this.hasFileDataTransfer(event)) {
      this.dragCounter--;
      if (this.dragCounter <= 0) {
        this.dragCounter = 0;
        this.isDraggingFile = false;
      }
    }
  }

  @HostListener('document:drop', ['$event'])
  async onDrop(event: DragEvent): Promise<void> {
    if (!this.hasFileDataTransfer(event)) {
      return;
    }
    event.preventDefault();
    this.dragCounter = 0;
    this.isDraggingFile = false;

    const dt = event.dataTransfer;
    const files: File[] = dt ? Array.from(dt.files) : [];
    if (!files.length) {
      return;
    }

    try {
      await this.FileHandleService.importFileList(files);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dropped file(s).';
      this.snackBar.open(message, 'Dismiss', { duration: 4500 });
    }
  }

  private hasFileDataTransfer(event: DragEvent): boolean {
    return !!(event.dataTransfer && event.dataTransfer.types && Array.from(event.dataTransfer.types).includes('Files'));
  }

  captureViewState(): WorkspaceViewState {
    const columnFilters: Record<string, string[] | null> = {};
    this.filterableColumns.forEach((column) => {
      const selected = this.columnFilters[column];
      columnFilters[column] = selected === null || selected === undefined
        ? null
        : Array.from(selected);
    });

    return {
      globalSearchTerm: this.globalSearchTerm,
      columnFilters,
      columnFilterOptions: { ...this.columnFilterOptions },
      activeFilterColumn: this.activeFilterColumn,
      ipFilterMode: this.ipFilterMode,
      ipRangeStart: this.ipRangeStart,
      ipRangeEnd: this.ipRangeEnd,
      ipSubnet: this.ipSubnet,
      columnTextFilterModes: { ...this.columnTextFilterModes },
      columnTextFilters: { ...this.columnTextFilters },
      columnTextFilterBlocked: { ...this.columnTextFilterBlocked },
      timeFilterMode: this.timeFilterMode,
      timeAbsoluteStart: this.timeAbsoluteStart,
      timeAbsoluteEnd: this.timeAbsoluteEnd,
      dataTimeMinMs: this.dataTimeMinMs,
      dataTimeMaxMs: this.dataTimeMaxMs,
      treeViewOpen: this.treeViewOpen,
      treeFilter: this.treeFilter ? { ...this.treeFilter } : null,
      selectedTreeNodeId: this.selectedTreeNodeId,
      selectedRowPosition: this.clickedRow?.position ?? null,
      compareRowPosition: this.compareRow?.position ?? null,
      diffMode: this.diffMode,
      diffLayout: this.diffLayout,
      replayMode: this.replayMode,
      requestSearch: this.requestSearch,
      responseSearch: this.responseSearch,
      wrapRequest: this.wrapRequest,
      wrapResponse: this.wrapResponse,
      inspectorTab: this.inspectorTab,
      inspectorOpen: this.inspectorOpen,
    };
  }

  private restoreViewState(state: WorkspaceViewState): void {
    this.globalSearchTerm = state.globalSearchTerm ?? '';
    this.columnFilterOptions = { ...state.columnFilterOptions };
    this.activeFilterColumn = state.activeFilterColumn ?? '';
    this.ipFilterMode = state.ipFilterMode ?? 'values';
    this.ipRangeStart = state.ipRangeStart ?? '';
    this.ipRangeEnd = state.ipRangeEnd ?? '';
    this.ipSubnet = state.ipSubnet ?? '';
    this.columnTextFilterModes = { ...this.columnTextFilterModes, ...state.columnTextFilterModes };
    this.columnTextFilters = { ...this.columnTextFilters, ...state.columnTextFilters };
    this.columnTextFilterBlocked = { ...this.columnTextFilterBlocked, ...state.columnTextFilterBlocked };
    this.timeFilterMode = state.timeFilterMode ?? 'none';
    this.timeAbsoluteStart = state.timeAbsoluteStart ?? '';
    this.timeAbsoluteEnd = state.timeAbsoluteEnd ?? '';
    this.dataTimeMinMs = state.dataTimeMinMs ?? null;
    this.dataTimeMaxMs = state.dataTimeMaxMs ?? null;
    this.treeViewOpen = !!state.treeViewOpen;
    this.treeFilter = state.treeFilter ? { ...state.treeFilter } : null;
    this.selectedTreeNodeId = state.selectedTreeNodeId ?? null;
    this.diffMode = !!state.diffMode;
    this.diffLayout = state.diffLayout ?? 'unified';
    this.replayMode = !!state.replayMode;
    this.requestSearch = state.requestSearch ?? '';
    this.responseSearch = state.responseSearch ?? '';
    this.wrapRequest = !!state.wrapRequest;
    this.wrapResponse = !!state.wrapResponse;
    this.inspectorTab = state.inspectorTab ?? 'attributes';
    this.inspectorOpen = state.inspectorOpen !== false;

    this.filterableColumns.forEach((column) => {
      const saved = state.columnFilters?.[column];
      if (saved === null || saved === undefined) {
        this.columnFilters[column] = null;
        return;
      }
      this.columnFilters[column] = new Set(saved);
    });

    const searchInput = document.getElementById('search') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.value = this.globalSearchTerm;
    }
  }

  private restoreSelectionFromViewState(state?: WorkspaceViewState): void {
    this.clickedRow = undefined;
    this.compareRow = undefined;

    if (!state) {
      return;
    }

    if (state.selectedRowPosition != null) {
      const row = this.findRowByPosition(state.selectedRowPosition);
      if (row) {
        this.selectRow(row);
      }
    }

    if (state.compareRowPosition != null) {
      const compareRow = this.findRowByPosition(state.compareRowPosition);
      if (compareRow) {
        this.compareRow = compareRow;
        this.updateDiffView();
      }
    }

    if (state.replayMode && this.clickedRow) {
      this.setReplayMode(true);
    }
  }
}
