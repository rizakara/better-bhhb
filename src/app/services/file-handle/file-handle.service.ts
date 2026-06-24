import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import * as xml2js from 'xml2js';
import { Base64 } from 'js-base64';

export interface StatusBreakdown {
  success: number;
  redirect: number;
  clientError: number;
  serverError: number;
  other: number;
}

export interface ExportFilterState {
  visibleCount: number;
  totalCount: number;
  positions: number[];
  isSubset: boolean;
  uniqueHosts: number;
  statusBreakdown: StatusBreakdown;
}

export interface BurpExport {
  'items': {
    '$': {
      'burpVersion': string,
      'exportTime': string
    },
    'item': Array<object>
  }
}

@Injectable({
  providedIn: 'root'
})
export class FileHandleService {

  constructor() { }

  private selectedFileName!: string | undefined;
  private selectedFileContent!: BurpExport | undefined;

  private selectedFileData = new Subject<{ selectedFileName: string, selectedFileContent: BurpExport | undefined }>();
  private exportFilterState = new BehaviorSubject<ExportFilterState>(this.createEmptyExportFilterState());
  private beforeSave = new Subject<void>();
  private requestEdits = new Map<number, string>();

  getselectedFileDataListener() {
    return this.selectedFileData.asObservable();
  }

  getExportFilterStateListener() {
    return this.exportFilterState.asObservable();
  }

  setExportFilterState(state: ExportFilterState): void {
    this.exportFilterState.next(state);
  }

  onBeforeSave() {
    return this.beforeSave.asObservable();
  }

  setRequestEdit(position: number, raw: string | null): void {
    if (raw === null) {
      this.requestEdits.delete(position);
      return;
    }
    this.requestEdits.set(position, raw);
  }

  hasRequestEdit(position: number): boolean {
    return this.requestEdits.has(position);
  }

  getRequestEdit(position: number): string | undefined {
    return this.requestEdits.get(position);
  }

  clearRequestEdits(): void {
    this.requestEdits.clear();
  }

  async importFiles(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const files = target.files ? Array.from(target.files) : [];
    if (!files.length) {
      return;
    }

    if (files.length === 1) {
      const content = await this.parseFile(files[0]);
      this.selectedFileName = files[0].name;
      this.clearRequestEdits();
      this.selectedFileContent = this.normalizeExport(content);
      this.emitSelectedFileData();
      this.resetFileInput(target);
      return;
    }

    const parsedExports = await Promise.all(files.map((file) => this.parseFile(file)));
    const normalizedExports = parsedExports.map((content) => this.normalizeExport(content));
    const exportsToMerge = this.selectedFileContent
      ? [this.selectedFileContent, ...normalizedExports]
      : normalizedExports;

    const names = this.selectedFileName
      ? [this.selectedFileName, ...files.map((file) => file.name)]
      : files.map((file) => file.name);

    this.selectedFileName = this.formatMergedFileName(names);
    this.clearRequestEdits();
    this.selectedFileContent = this.mergeExports(exportsToMerge);
    this.emitSelectedFileData();
    this.resetFileInput(target);
  }

  async fileClear(): Promise<void> {
    this.selectedFileName = undefined;
    this.selectedFileContent = undefined;
    this.clearRequestEdits();
    this.exportFilterState.next(this.createEmptyExportFilterState());
    this.emitSelectedFileData();
  }

  saveAs(scope: 'all' | 'filtered' = 'all'): void {
    if (!this.selectedFileContent) {
      throw new Error('No data to save. Open or merge a file first.');
    }

    this.beforeSave.next();
    this.applyRequestEditsToContent();

    const filterState = this.exportFilterState.value;
    let exportContent = this.selectedFileContent;
    let downloadName = this.suggestSaveFileName();

    if (scope === 'filtered') {
      if (!filterState.isSubset || !filterState.positions.length) {
        throw new Error('No filtered items to save.');
      }
      exportContent = this.buildSubsetExport(filterState.positions);
      downloadName = this.suggestFilteredSaveFileName(filterState.visibleCount);
    }

    const builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true, indent: '  ' },
    });
    const xml = builder.buildObject({ items: exportContent.items });
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async parseFile(file: File): Promise<any> {
    const text = await file.text();
    try {
      return await xml2js.parseStringPromise(text);
    } catch (error) {
      console.error(`Failed to parse ${file.name}`, error);
      throw new Error(`Could not parse ${file.name}. Make sure it is a Burp XML export.`);
    }
  }

  private normalizeExport(content: any): BurpExport {
    const items = this.extractItems(content);
    const metadata = content?.items?.$ ?? {
      burpVersion: 'unknown',
      exportTime: new Date().toISOString(),
    };

    return {
      items: {
        '$': metadata,
        item: items,
      },
    };
  }

  private extractItems(content: any): object[] {
    const rawItems = content?.items?.item;
    if (!rawItems) {
      return [];
    }
    return Array.isArray(rawItems) ? rawItems : [rawItems];
  }

  private mergeExports(exports: BurpExport[]): BurpExport {
    const mergedItems = exports.flatMap((entry) => entry.items.item ?? []);
    const firstMetadata = exports[0]?.items?.$ ?? {
      burpVersion: 'merged',
      exportTime: new Date().toISOString(),
    };

    return {
      items: {
        '$': {
          ...firstMetadata,
          exportTime: new Date().toISOString(),
        },
        item: mergedItems,
      },
    };
  }

  private formatMergedFileName(names: string[]): string {
    if (names.length === 2) {
      return `${names[0]} + ${names[1]}`;
    }
    return `${names.length} files merged`;
  }

  private emitSelectedFileData(): void {
    this.selectedFileData.next({
      selectedFileName: this.selectedFileName!,
      selectedFileContent: this.selectedFileContent,
    });
  }

  private resetFileInput(target: HTMLInputElement): void {
    target.value = '';
  }

  private applyRequestEditsToContent(): void {
    if (!this.selectedFileContent || !this.requestEdits.size) {
      return;
    }

    const items = this.normalizeItems(this.selectedFileContent.items.item);
    this.requestEdits.forEach((rawRequest, position) => {
      const item = items[position - 1];
      if (item) {
        this.writeRequestToItem(item, rawRequest);
      }
    });
    this.selectedFileContent.items.item = items;
  }

  private normalizeItems(items: object[] | object | undefined): object[] {
    if (!items) {
      return [];
    }
    return Array.isArray(items) ? items : [items];
  }

  private writeRequestToItem(item: any, rawRequest: string): void {
    if (!item.request) {
      item.request = [{ $: { base64: 'false' }, _: rawRequest }];
      return;
    }

    const requestNode = Array.isArray(item.request) ? item.request[0] : item.request;
    const useBase64 = requestNode.$?.base64 === 'true';
    if (!requestNode.$) {
      requestNode.$ = { base64: useBase64 ? 'true' : 'false' };
    }
    requestNode._ = useBase64 ? Base64.encode(rawRequest) : rawRequest;
  }

  private buildSubsetExport(positions: number[]): BurpExport {
    const allItems = this.normalizeItems(this.selectedFileContent?.items?.item);
    const positionSet = new Set(positions);
    const filteredItems = allItems.filter((_item, index) => positionSet.has(index + 1));
    const metadata = this.selectedFileContent?.items?.$ ?? {
      burpVersion: 'unknown',
      exportTime: new Date().toISOString(),
    };

    return {
      items: {
        '$': {
          ...metadata,
          exportTime: new Date().toISOString(),
        },
        item: filteredItems,
      },
    };
  }

  private createEmptyExportFilterState(): ExportFilterState {
    return {
      visibleCount: 0,
      totalCount: 0,
      positions: [],
      isSubset: false,
      uniqueHosts: 0,
      statusBreakdown: this.createEmptyStatusBreakdown(),
    };
  }

  private createEmptyStatusBreakdown(): StatusBreakdown {
    return {
      success: 0,
      redirect: 0,
      clientError: 0,
      serverError: 0,
      other: 0,
    };
  }

  private suggestSaveFileName(): string {
    const rawName = (this.selectedFileName ?? 'burp-export').trim();
    const withoutExtension = rawName.replace(/\.xml$/i, '');
    return `${withoutExtension}.xml`;
  }

  private suggestFilteredSaveFileName(visibleCount: number): string {
    const rawName = (this.selectedFileName ?? 'burp-export').trim();
    const withoutExtension = rawName.replace(/\.xml$/i, '');
    return `${withoutExtension}-filtered-${visibleCount}.xml`;
  }
}