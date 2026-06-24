import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import * as xml2js from 'xml2js';

export interface ExportFilterState {
  visibleCount: number;
  totalCount: number;
  positions: number[];
  isSubset: boolean;
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

  getselectedFileDataListener() {
    return this.selectedFileData.asObservable();
  }

  getExportFilterStateListener() {
    return this.exportFilterState.asObservable();
  }

  setExportFilterState(state: ExportFilterState): void {
    this.exportFilterState.next(state);
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
    this.selectedFileContent = this.mergeExports(exportsToMerge);
    this.emitSelectedFileData();
    this.resetFileInput(target);
  }

  async fileClear(): Promise<void> {
    this.selectedFileName = undefined;
    this.selectedFileContent = undefined;
    this.exportFilterState.next(this.createEmptyExportFilterState());
    this.emitSelectedFileData();
  }

  saveAs(scope: 'all' | 'filtered' = 'all'): void {
    if (!this.selectedFileContent) {
      throw new Error('No data to save. Open or merge a file first.');
    }

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

  private buildSubsetExport(positions: number[]): BurpExport {
    const allItems = this.selectedFileContent?.items?.item ?? [];
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