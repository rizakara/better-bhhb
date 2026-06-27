import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import * as xml2js from 'xml2js';
import { Base64 } from 'js-base64';
import { MatDialog } from '@angular/material/dialog';
import { FileSessionStorageService, StoredHistoryEntry } from './file-session-storage.service';
import { ImportModeDialogComponent, ImportModeDialogData } from '../../components/header/import-mode-dialog.component';

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

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface FileSystemWritableFileStream {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

@Injectable({
  providedIn: 'root'
})
export class FileHandleService {

  constructor(
    private fileSessionStorage: FileSessionStorageService,
    private dialog: MatDialog
  ) { }

  private selectedFileName!: string | undefined;
  private selectedFileContent!: BurpExport | undefined;

  private selectedFileData = new Subject<{ selectedFileName: string, selectedFileContent: BurpExport | undefined }>();
  private exportFilterState = new BehaviorSubject<ExportFilterState>(this.createEmptyExportFilterState());
  private beforeSave = new Subject<void>();
  private requestEdits = new Map<number, string>();
  private commentEdits = new Map<number, string>();
  private importing = new BehaviorSubject<boolean>(false);
  private sessionReadyPromise: Promise<void> | null = null;

  getselectedFileDataListener() {
    return this.selectedFileData.asObservable();
  }

  getExportFilterStateListener() {
    return this.exportFilterState.asObservable();
  }

  getImportingListener() {
    return this.importing.asObservable();
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

  setCommentEdit(position: number, comment: string | null): void {
    if (comment === null) {
      this.commentEdits.delete(position);
      return;
    }
    this.commentEdits.set(position, comment);
  }

  hasCommentEdit(position: number): boolean {
    return this.commentEdits.has(position);
  }

  getCommentEdit(position: number): string | undefined {
    return this.commentEdits.get(position);
  }

  clearCommentEdits(): void {
    this.commentEdits.clear();
  }

  clearEdits(): void {
    this.clearRequestEdits();
    this.clearCommentEdits();
  }

  ensureSessionRestored(): Promise<void> {
    if (!this.sessionReadyPromise) {
      this.sessionReadyPromise = this.restoreLastSession()
        .then(() => undefined)
        .catch((error) => {
          console.warn('Failed to restore last session.', error);
          return undefined;
        });
    }
    return this.sessionReadyPromise;
  }

  async importBurpXml(
    xml: string,
    options?: { source?: StoredHistoryEntry['source']; rawXml?: string; fileName?: string }
  ): Promise<number | null> {
    await this.ensureSessionRestored();

    const parsed = await this.parseXmlText(xml);
    const normalized = this.normalizeExport(parsed);
    const itemCount = normalized.items.item.length;
    const fileName = options?.fileName ?? this.suggestBurpImportFileName(itemCount);
    const hasExisting = !!this.selectedFileContent;

    let mode: 'merge' | 'replace' = 'replace';

    if (hasExisting) {
      this.importing.next(true);
      const choice = await this.promptForImportMode(1);
      if (!choice) {
        this.importing.next(false);
        return null;
      }
      mode = choice;
    } else {
      this.importing.next(true);
    }

    try {
      if (mode === 'replace' || !this.selectedFileContent) {
        this.selectedFileName = fileName;
        this.selectedFileContent = normalized;
      } else {
        const exportsToMerge = [this.selectedFileContent, normalized];
        const names = [this.selectedFileName!, fileName];
        this.selectedFileName = this.formatMergedFileName(names);
        this.selectedFileContent = this.mergeExports(exportsToMerge);
      }

      this.clearEdits();
      this.emitSelectedFileData();
      await this.persistCurrentSession({
        source: options?.source ?? 'burp-extension',
        rawXml: options?.rawXml ?? xml,
      });

      return itemCount;
    } finally {
      this.importing.next(false);
    }
  }

  async listImportHistory(): Promise<StoredHistoryEntry[]> {
    return this.fileSessionStorage.listHistory();
  }

  async openHistoryEntry(id: string): Promise<boolean> {
    return this.openHistoryEntries([id]);
  }

  async openHistoryEntries(ids: string[]): Promise<boolean> {
    const uniqueIds = [...new Set(ids.filter((id) => !!id))];
    if (!uniqueIds.length) {
      return false;
    }

    const entries = await Promise.all(uniqueIds.map((id) => this.fileSessionStorage.loadHistoryEntry(id)));
    const validEntries = entries.filter((entry): entry is StoredHistoryEntry => entry != null);
    if (!validEntries.length) {
      throw new Error('Saved session not found.');
    }

    const openedSession = validEntries.length === 1
      ? {
          fileName: validEntries[0].fileName,
          content: validEntries[0].content,
        }
      : {
          fileName: this.formatMergedFileName(validEntries.map((entry) => entry.fileName)),
          content: this.mergeExports(validEntries.map((entry) => entry.content)),
        };

    return this.applyOpenedSession(openedSession, validEntries.length);
  }

  private async applyOpenedSession(
    openedSession: { fileName: string; content: BurpExport },
    openedCount: number
  ): Promise<boolean> {
    const hasExisting = !!this.selectedFileContent;
    let mode: 'merge' | 'replace' = 'replace';

    if (hasExisting) {
      this.importing.next(true);
      const choice = await this.promptForImportMode(openedCount);
      if (!choice) {
        this.importing.next(false);
        return false;
      }
      mode = choice;
    } else {
      this.importing.next(true);
    }

    try {
      if (mode === 'replace' || !this.selectedFileContent) {
        this.selectedFileName = openedSession.fileName;
        this.selectedFileContent = openedSession.content;
      } else {
        const exportsToMerge = [this.selectedFileContent, openedSession.content];
        const names = [this.selectedFileName!, openedSession.fileName];
        this.selectedFileName = this.formatMergedFileName(names);
        this.selectedFileContent = this.mergeExports(exportsToMerge);
      }

      this.clearEdits();
      this.emitSelectedFileData();
      await this.persistCurrentSession({ recordHistory: false });
      return true;
    } finally {
      this.importing.next(false);
    }
  }

  async deleteHistoryEntry(id: string): Promise<void> {
    await this.fileSessionStorage.deleteHistoryEntry(id);
  }

  async restoreLastSession(): Promise<boolean> {
    const session = await this.fileSessionStorage.load();
    if (!session) {
      return false;
    }

    this.selectedFileName = session.fileName;
    this.selectedFileContent = session.content;
    this.clearEdits();
    this.emitSelectedFileData();
    return true;
  }

  async importFiles(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const files = target.files ? Array.from(target.files) : [];
    await this.importFileList(files);
    this.resetFileInput(target);
  }

  async importFileList(files: File[]): Promise<void> {
    if (!files.length) {
      return;
    }

    const hasExisting = !!this.selectedFileContent;

    let mode: 'merge' | 'replace' = 'replace';

    if (hasExisting) {
      this.importing.next(true);
      const choice = await this.promptForImportMode(files.length);
      if (!choice) {
        this.importing.next(false);
        return;
      }
      mode = choice;
    } else {
      this.importing.next(true);
    }

    try {
      const parsedExports = await Promise.all(files.map((file) => this.parseFile(file)));
      const normalizedExports = parsedExports.map((content) => this.normalizeExport(content));

      if (mode === 'replace' || !this.selectedFileContent) {
        // Replace: use only the newly provided file(s)
        if (files.length === 1) {
          this.selectedFileName = files[0].name;
          this.selectedFileContent = normalizedExports[0];
        } else {
          const names = files.map((file) => file.name);
          this.selectedFileName = this.formatMergedFileName(names);
          this.selectedFileContent = this.mergeExports(normalizedExports);
        }
      } else {
        // Merge with existing
        const exportsToMerge = [this.selectedFileContent, ...normalizedExports];
        const names = [this.selectedFileName!, ...files.map((file) => file.name)];
        this.selectedFileName = this.formatMergedFileName(names);
        this.selectedFileContent = this.mergeExports(exportsToMerge);
      }

      this.clearEdits();
      this.emitSelectedFileData();
      await this.persistCurrentSession();
    } finally {
      this.importing.next(false);
    }
  }

  private async promptForImportMode(newFileCount: number): Promise<'merge' | 'replace' | null> {
    const dialogRef = this.dialog.open(ImportModeDialogComponent, {
      width: '420px',
      panelClass: 'bhhb-dialog',
      data: {
        existingName: this.selectedFileName || 'current file',
        newFileCount,
      } as ImportModeDialogData,
    });

    return new Promise((resolve) => {
      dialogRef.afterClosed().subscribe((result: 'merge' | 'replace' | undefined) => {
        resolve(result ?? null);
      });
    });
  }

  async fileClear(): Promise<void> {
    this.selectedFileName = undefined;
    this.selectedFileContent = undefined;
    this.clearEdits();
    this.exportFilterState.next(this.createEmptyExportFilterState());
    await this.fileSessionStorage.clear();
    this.emitSelectedFileData();
  }

  async saveAs(scope: 'all' | 'filtered' = 'all'): Promise<void> {
    if (!this.selectedFileContent) {
      throw new Error('No data to save. Open or merge a file first.');
    }

    this.beforeSave.next();
    this.applyRequestEditsToContent();
    this.applyCommentEditsToContent();

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

    const savedWithPicker = await this.tryShowSaveFilePicker(blob, downloadName);
    if (!savedWithPicker) {
      this.downloadBlob(blob, downloadName);
    }
  }

  private async parseFile(file: File): Promise<any> {
    const text = await file.text();
    return this.parseXmlText(text, file.name);
  }

  private async parseXmlText(text: string, fileName = 'Burp export'): Promise<any> {
    try {
      return await xml2js.parseStringPromise(text);
    } catch (error) {
      console.error(`Failed to parse ${fileName}`, error);
      throw new Error(`Could not parse ${fileName}. Make sure it is a Burp XML export.`);
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

  private async persistCurrentSession(options?: {
    source?: StoredHistoryEntry['source'];
    rawXml?: string;
    recordHistory?: boolean;
  }): Promise<void> {
    if (!this.selectedFileName || !this.selectedFileContent) {
      return;
    }

    try {
      await this.fileSessionStorage.save({
        fileName: this.selectedFileName,
        content: this.selectedFileContent,
      }, {
        source: options?.source,
        rawXml: options?.rawXml,
        recordHistory: options?.recordHistory,
      });
    } catch (error) {
      console.warn('Failed to persist last opened file.', error);
    }
  }

  private suggestBurpImportFileName(itemCount: number): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `burp-proxy-history-${itemCount}-items-${timestamp}.xml`;
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

  private applyCommentEditsToContent(): void {
    if (!this.selectedFileContent || !this.commentEdits.size) {
      return;
    }

    const items = this.normalizeItems(this.selectedFileContent.items.item);
    this.commentEdits.forEach((comment, position) => {
      const item = items[position - 1];
      if (item) {
        this.writeCommentToItem(item, comment);
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

  private writeCommentToItem(item: any, comment: string): void {
    if (Array.isArray(item.comment)) {
      item.comment = [comment];
      return;
    }
    item.comment = comment;
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

  private async tryShowSaveFilePicker(blob: Blob, suggestedName: string): Promise<boolean> {
    const showSaveFilePicker = (window as Window & {
      showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    }).showSaveFilePicker;

    if (!showSaveFilePicker) {
      return false;
    }

    try {
      const handle = await showSaveFilePicker({
        suggestedName,
        types: [{
          description: 'Burp XML export',
          accept: {
            'application/xml': ['.xml'],
            'text/xml': ['.xml'],
          },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return true;
      }
      console.warn('Native save dialog unavailable, falling back to download.', error);
      return false;
    }
  }

  private downloadBlob(blob: Blob, downloadName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}