import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import * as xml2js from 'xml2js';
import { Base64 } from 'js-base64';
import { MatDialog } from '@angular/material/dialog';
import { FileSessionStorageService, StoredHistoryEntry } from './file-session-storage.service';
import {
  ImportDestinationDialogComponent,
  ImportDestinationDialogData,
  ImportDestinationDialogResult,
} from '../../components/header/import-destination-dialog.component';
import {
  ImportDuplicateDialogComponent,
  ImportDuplicateDialogData,
  ImportDuplicateDialogResult,
} from '../../components/header/import-duplicate-dialog.component';
import { WorkspaceService } from '../workspace/workspace.service';
import { WorkspaceTabData, WorkspaceViewState } from '../workspace/workspace-view-state';

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
    private dialog: MatDialog,
    private workspaceService: WorkspaceService,
  ) { }

  private selectedFileName!: string | undefined;
  private selectedFileContent!: BurpExport | undefined;

  private selectedFileData = new Subject<{
    selectedFileName: string;
    selectedFileContent: BurpExport | undefined;
    viewState?: WorkspaceViewState;
  }>();
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
        .then(() => {
          this.workspaceService.ensureInitialTab();
          return undefined;
        })
        .catch((error) => {
          console.warn('Failed to restore last session.', error);
          this.workspaceService.ensureInitialTab();
          return undefined;
        });
    }
    return this.sessionReadyPromise;
  }

  async createWorkspaceTab(label?: string): Promise<void> {
    await this.ensureSessionRestored();
    this.syncActiveWorkspaceTab();
    const newTab = this.workspaceService.createTab(label);
    const activated = await this.workspaceService.switchTo(newTab.id);
    if (activated) {
      await this.applyWorkspaceTab(activated);
    }
  }

  async switchWorkspaceTab(tabId: string): Promise<void> {
    await this.ensureSessionRestored();
    this.syncActiveWorkspaceTab();
    const tab = await this.workspaceService.switchTo(tabId);
    if (!tab) {
      return;
    }
    await this.applyWorkspaceTab(tab);
  }

  async closeWorkspaceTab(tabId: string): Promise<void> {
    await this.ensureSessionRestored();
    if (tabId === this.workspaceService.getActiveTabId()) {
      this.syncActiveWorkspaceTab();
    }
    const nextTab = this.workspaceService.closeTab(tabId);
    if (!nextTab) {
      return;
    }
    await this.applyWorkspaceTab(nextTab);
  }

  renameWorkspaceTab(tabId: string, label: string): void {
    this.workspaceService.renameTab(tabId, label);
  }

  private syncActiveWorkspaceTab(): void {
    this.workspaceService.updateActiveTabFromFile(this.selectedFileName, this.selectedFileContent, {
      requestEdits: this.serializeEdits(this.requestEdits),
      commentEdits: this.serializeEdits(this.commentEdits),
    });
  }

  private async activateWorkspaceTab(tabId: string): Promise<void> {
    const tab = await this.workspaceService.switchTo(tabId);
    if (!tab) {
      return;
    }
    await this.applyWorkspaceTab(tab);
  }

  private async applyWorkspaceTab(tab: WorkspaceTabData): Promise<void> {
    this.selectedFileName = tab.fileName;
    this.selectedFileContent = tab.content;
    this.loadEdits(tab.requestEdits, tab.commentEdits);

    if (!tab.content) {
      this.exportFilterState.next(this.createEmptyExportFilterState());
    }

    this.emitSelectedFileData(tab.viewState);
  }

  private loadEdits(
    requestEdits: Record<number, string>,
    commentEdits: Record<number, string>,
  ): void {
    this.requestEdits = new Map(
      Object.entries(requestEdits).map(([position, value]) => [Number(position), value]),
    );
    this.commentEdits = new Map(
      Object.entries(commentEdits).map(([position, value]) => [Number(position), value]),
    );
  }

  private serializeEdits(edits: Map<number, string>): Record<number, string> {
    const serialized: Record<number, string> = {};
    edits.forEach((value, position) => {
      serialized[position] = value;
    });
    return serialized;
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

    this.importing.next(true);
    try {
      const destination = await this.promptForImportDestination(1);
      if (!destination || !(await this.prepareImportTarget(destination))) {
        return null;
      }

      if (!(await this.applyImportedExports([{ name: fileName, content: normalized }], destination.mode))) {
        return null;
      }
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

    const imports = validEntries.map((entry) => ({
      name: entry.fileName,
      content: entry.content,
    }));

    return this.applyOpenedSession(imports, validEntries.length);
  }

  private async applyOpenedSession(
    imports: Array<{ name: string; content: BurpExport }>,
    openedCount: number
  ): Promise<boolean> {
    this.importing.next(true);
    try {
      const destination = await this.promptForImportDestination(openedCount);
      if (!destination || !(await this.prepareImportTarget(destination))) {
        return false;
      }

      if (!(await this.applyImportedExports(imports, destination.mode))) {
        return false;
      }
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

    const tab = this.workspaceService.restoreTab(session.fileName, session.content);
    await this.applyWorkspaceTab(tab);
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

    this.importing.next(true);
    try {
      const destination = await this.promptForImportDestination(files.length);
      if (!destination || !(await this.prepareImportTarget(destination))) {
        return;
      }

      const parsedExports = await Promise.all(files.map((file) => this.parseFile(file)));
      const imports = files.map((file, index) => ({
        name: file.name,
        content: this.normalizeExport(parsedExports[index]),
      }));
      if (!(await this.applyImportedExports(imports, destination.mode))) {
        return;
      }
      await this.persistCurrentSession();
    } finally {
      this.importing.next(false);
    }
  }

  private async promptForImportDestination(
    newFileCount: number,
  ): Promise<ImportDestinationDialogResult | null> {
    await this.ensureSessionRestored();
    this.syncActiveWorkspaceTab();

    const activeTabId = this.workspaceService.getActiveTabId();
    const dialogRef = this.dialog.open(ImportDestinationDialogComponent, {
      width: '460px',
      panelClass: 'bhhb-dialog',
      data: {
        newFileCount,
        workspaces: this.workspaceService.getTabs().map((tab) => ({
          id: tab.id,
          label: tab.label,
          fileName: tab.fileName,
          hasContent: !!tab.content,
          isActive: tab.id === activeTabId,
        })),
      } as ImportDestinationDialogData,
    });

    return new Promise((resolve) => {
      dialogRef.afterClosed().subscribe((result) => {
        resolve(result ?? null);
      });
    });
  }

  private async prepareImportTarget(
    destination: ImportDestinationDialogResult,
  ): Promise<boolean> {
    await this.ensureSessionRestored();
    this.syncActiveWorkspaceTab();

    if (destination.workspaceId === 'new') {
      const newTab = this.workspaceService.createTab();
      const activated = await this.workspaceService.switchTo(newTab.id);
      if (!activated) {
        return false;
      }
      await this.applyWorkspaceTab(activated);
      return true;
    }

    if (destination.workspaceId === this.workspaceService.getActiveTabId()) {
      return true;
    }

    const activated = await this.workspaceService.switchTo(destination.workspaceId);
    if (!activated) {
      return false;
    }
    await this.applyWorkspaceTab(activated);
    return true;
  }

  private async applyImportedExports(
    imports: Array<{ name: string; content: BurpExport }>,
    mode: 'merge' | 'replace',
  ): Promise<boolean> {
    const normalizedExports = imports.map((entry) => entry.content);

    if (mode === 'replace' || !this.selectedFileContent) {
      if (imports.length === 1) {
        this.selectedFileName = imports[0].name;
        this.selectedFileContent = normalizedExports[0];
      } else {
        this.selectedFileName = this.formatMergedFileName(imports.map((entry) => entry.name));
        const merged = await this.mergeExports(normalizedExports);
        if (!merged) {
          return false;
        }
        this.selectedFileContent = merged;
      }
    } else {
      const exportsToMerge = [this.selectedFileContent, ...normalizedExports];
      const names = [this.selectedFileName!, ...imports.map((entry) => entry.name)];
      this.selectedFileName = this.formatMergedFileName(names);
      const merged = await this.mergeExports(exportsToMerge);
      if (!merged) {
        return false;
      }
      this.selectedFileContent = merged;
    }

    this.clearEdits();
    this.syncWorkspaceAfterImport();
    return true;
  }

  async fileClear(): Promise<void> {
    this.selectedFileName = undefined;
    this.selectedFileContent = undefined;
    this.clearEdits();
    this.exportFilterState.next(this.createEmptyExportFilterState());
    await this.fileSessionStorage.clear();
    this.workspaceService.updateActiveTabFromFile(undefined, undefined, { resetViewState: true });
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

  private async mergeExports(exports: BurpExport[]): Promise<BurpExport | null> {
    const mergedItems = exports.flatMap((entry) => entry.items.item ?? []);
    const { hasDuplicates, duplicateCount } = this.analyzeDuplicates(mergedItems);
    let items = mergedItems;

    if (hasDuplicates) {
      const choice = await this.promptForDuplicateHandling({
        duplicateCount,
        totalItems: mergedItems.length,
      });
      if (!choice) {
        return null;
      }
      if (choice === 'keep-one') {
        items = this.deduplicateItems(mergedItems);
      }
    }

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
        item: items,
      },
    };
  }

  private async promptForDuplicateHandling(
    data: ImportDuplicateDialogData,
  ): Promise<ImportDuplicateDialogResult | null> {
    const dialogRef = this.dialog.open(ImportDuplicateDialogComponent, {
      width: '460px',
      panelClass: 'bhhb-dialog',
      data,
    });

    return new Promise((resolve) => {
      dialogRef.afterClosed().subscribe((result) => {
        resolve(result ?? null);
      });
    });
  }

  private analyzeDuplicates(items: object[]): { hasDuplicates: boolean; duplicateCount: number } {
    const seen = new Set<string>();
    let duplicateCount = 0;

    for (const item of items) {
      const fingerprint = this.buildItemFingerprint(item);
      if (seen.has(fingerprint)) {
        duplicateCount += 1;
      } else {
        seen.add(fingerprint);
      }
    }

    return {
      hasDuplicates: duplicateCount > 0,
      duplicateCount,
    };
  }

  private deduplicateItems(items: object[]): object[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const fingerprint = this.buildItemFingerprint(item);
      if (seen.has(fingerprint)) {
        return false;
      }
      seen.add(fingerprint);
      return true;
    });
  }

  private buildItemFingerprint(item: object): string {
    const record = item as Record<string, unknown>;
    return [
      this.normalizeItemField(record['time']),
      this.normalizeItemField(record['method']),
      this.normalizeItemField(record['protocol']),
      this.normalizeItemHost(record['host']),
      this.normalizeItemField(record['port']),
      this.normalizeItemField(record['path']),
      this.normalizeItemField(record['url']),
      this.normalizeItemPayload(record['request']),
      this.normalizeItemField(record['status']),
      this.normalizeItemPayload(record['response']),
    ].join('\0');
  }

  private normalizeItemField(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (Array.isArray(value)) {
      return String(value[0] ?? '').trim();
    }
    return String(value).trim();
  }

  private normalizeItemHost(host: unknown): string {
    if (!host) {
      return '';
    }
    const node = Array.isArray(host) ? host[0] : host;
    if (!node || typeof node !== 'object') {
      return '';
    }
    const record = node as { $?: { ip?: string }; _?: string };
    return `${record.$?.ip ?? ''}\0${record._ ?? ''}`;
  }

  private normalizeItemPayload(payload: unknown): string {
    if (!payload) {
      return '';
    }
    const node = Array.isArray(payload) ? payload[0] : payload;
    if (!node || typeof node !== 'object') {
      return '';
    }
    const record = node as { $?: { base64?: string }; _?: string };
    const raw = record._ ?? '';
    if (record.$?.base64 === 'true') {
      try {
        return Base64.decode(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }

  private formatMergedFileName(names: string[]): string {
    if (names.length === 2) {
      return `${names[0]} + ${names[1]}`;
    }
    return `${names.length} files merged`;
  }

  private syncWorkspaceAfterImport(): void {
    this.workspaceService.updateActiveTabFromFile(this.selectedFileName, this.selectedFileContent, {
      requestEdits: {},
      commentEdits: {},
      resetViewState: true,
    });
    this.emitSelectedFileData();
  }

  private emitSelectedFileData(viewState?: WorkspaceViewState): void {
    this.selectedFileData.next({
      selectedFileName: this.selectedFileName!,
      selectedFileContent: this.selectedFileContent,
      viewState,
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