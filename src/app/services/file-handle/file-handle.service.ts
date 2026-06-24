import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import * as xml2js from 'xml2js';

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

  getselectedFileDataListener() {
    return this.selectedFileData.asObservable();
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
    this.emitSelectedFileData();
  }

  saveAs(): void {
    if (!this.selectedFileContent) {
      throw new Error('No data to save. Open or merge a file first.');
    }

    const builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true, indent: '  ' },
    });
    const xml = builder.buildObject({ items: this.selectedFileContent.items });
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.suggestSaveFileName();
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

  private suggestSaveFileName(): string {
    const rawName = (this.selectedFileName ?? 'burp-export').trim();
    const withoutExtension = rawName.replace(/\.xml$/i, '');
    return `${withoutExtension}.xml`;
  }
}