import { ChangeDetectorRef, Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { FileHandleService, BurpExport } from '../../services/file-handle/file-handle.service'
import { Subscription } from 'rxjs';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Base64 } from 'js-base64';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {

  constructor(
    private FileHandleService: FileHandleService,
    private cdr: ChangeDetectorRef
  ) { }

  fileSub!: Subscription
  selectedFileContent!: BurpExport | undefined;
  displayedColumns: string[] = ['position', 'host', 'method', 'path', 'status', 'responselength', 'mimetype', 'extension', 'title', 'comment', 'ip', 'time'];
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

  ngOnInit(): void {
    this.setupFilterPredicate();
    this.fileSub = this.FileHandleService.getselectedFileDataListener()
      .subscribe((selectedFileData: { selectedFileContent: BurpExport | undefined }) => {
        if (!selectedFileData.selectedFileContent) {
          this.dataSource = new MatTableDataSource();
          this.selectedFileContent = selectedFileData.selectedFileContent;
          this.clickedRow = undefined;
          this.resetColumnFilters();
          return
        }
        this.selectedFileContent = selectedFileData.selectedFileContent
        // console.log(this.selectedFileContent);
        this.elementDataGen(this.selectedFileContent)
        this.initializeColumnFilters();
        this.dataSource = new MatTableDataSource(this.ELEMENT_DATA);
        this.dataSource.filterPredicate = this.createFilterPredicate();
        this.dataSource.sort = this.sort;
        this.refreshTableFilter();
      })
  }

  @ViewChild(MatSort, { static: false }) sort!: MatSort;

  elementDataGen(content: any) {
    this.ELEMENT_DATA = []
    let position = 1
    content.items.item.forEach((element: any) => {
      this.ELEMENT_DATA.push(
        {
          position: position,
          ip: element.host[0].$.ip,
          host: element.protocol + '://' + element.host[0]._ + this.portAssign(element.protocol, element.port),
          port: element.port,
          protocol: element.protocol,
          method: element.method,
          status: element.status,
          path: this.normalizeXmlValue(element.path),
          responselength: element.responselength,
          comment: element.comment,
          url: element.url,
          time: this.normalizeXmlValue(element.time),
          timeMs: this.parseBurpTime(element.time),
          mimetype: element.mimetype,
          extension: element.extension != 'null' ? element.extension : '',
          request: this.splitHeaderBody(this.atobReqRes(element.request)),
          response: this.splitHeaderBody(this.atobReqRes(element.response)),
          title: this.extractTitleFromHttpResponse(this.atobReqRes(element.response)),
        }
      )
      position += 1;
    });
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.displayedColumns, event.previousIndex, event.currentIndex);
  }

  private splitHeaderBody(text: any): any {
    // https://bobbyhadz.com/blog/javascript-split-string-only-on-first-instance-of-character
    let [header, ...body] = text.split(/\n\s*\n/)
    header = header.split(/\r\n/)

    // https://stackoverflow.com/a/12482991
    header.forEach((elem: string, index: string | number) => {
      let [key, ...value] = elem.split(": ")
      header[index] = [key, value.join("")]
    }, header);

    return [header, body.join("")]
  }

  private atobReqRes(query: any): string {
    try {
      if (query[0].$.base64 === 'true') {
        return Base64.decode(query[0]._ ?? "");
      }
      return query[0]._ ?? "";
    } catch (error) {
      console.log(error);
      console.log(query);
    }
    return ''
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

  private extractTitleFromHttpResponse(response: string): string {
    const titleRegex = /<title>(.*?)<\/title>/i;
    const match = response.match(titleRegex);
    if (match && match.length > 1) {
      return match[1];
    }
    return '';
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value ? (event.target as HTMLInputElement).value : "";
    this.globalSearchTerm = filterValue.trim();
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
    }
    this.refreshTableFilter();
  }

  onColumnTextInput(column: string, event: Event) {
    this.columnTextFilters[column] = (event.target as HTMLInputElement).value;
    this.columnTextFilterBlocked[column] = false;
    this.columnTextFilterModes[column] = 'text';
    this.refreshTableFilter();
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
    this.ipFilterMode = 'range';
    this.ipFilterError = '';
    this.refreshTableFilter();
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
    this.ipFilterMode = 'subnet';
    this.ipFilterError = '';
    this.refreshTableFilter();
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
      if (this.globalSearchTerm) {
        const term = this.globalSearchTerm.toLowerCase();
        const rowText = Object.values(data).join(' ').toLowerCase();
        if (!rowText.includes(term)) {
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
  }

  selectRow(row: any) {
    if (this.clickedRow !== row) {
      this.requestSearch = '';
      this.responseSearch = '';
      this.resetRequestSearchState();
      this.resetResponseSearchState();
    }
    this.clickedRow = row;
    this.updateRequestHighlights();
    this.updateResponseHighlights();
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

  @HostListener('window:keydown.esc', ['$event'])
  clearclickedRow(event: KeyboardEvent) {
    event.preventDefault();
    if (this.clickedRow) {
      this.clickedRow = undefined;
      this.clearPanelSearches();
    } else {
      (document.getElementById('search') as HTMLInputElement).value = "";
      this.applyFilter(event)
    }
  }
}
