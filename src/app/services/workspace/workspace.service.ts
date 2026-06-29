import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BurpExport } from '../file-handle/file-handle.service';
import { RowHighlightColor } from '../row-triage/row-triage.types';
import { WorkspaceTabData, WorkspaceViewState } from './workspace-view-state';

export type ViewStateProvider = () => WorkspaceViewState | undefined;

@Injectable({
  providedIn: 'root',
})
export class WorkspaceService {
  private tabs: WorkspaceTabData[] = [];
  private activeTabId: string | null = null;
  private viewStateProvider: ViewStateProvider | null = null;
  private tabCounter = 0;

  private tabsSubject = new BehaviorSubject<WorkspaceTabData[]>([]);
  private activeTabIdSubject = new BehaviorSubject<string | null>(null);

  getTabsListener() {
    return this.tabsSubject.asObservable();
  }

  getActiveTabIdListener() {
    return this.activeTabIdSubject.asObservable();
  }

  getTabs(): WorkspaceTabData[] {
    return this.tabs.map((tab) => this.cloneTab(tab));
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  getActiveTab(): WorkspaceTabData | null {
    const tab = this.tabs.find((candidate) => candidate.id === this.activeTabId);
    return tab ? this.cloneTab(tab) : null;
  }

  registerViewStateProvider(provider: ViewStateProvider): void {
    this.viewStateProvider = provider;
  }

  ensureInitialTab(): string {
    if (!this.tabs.length) {
      const tab = this.createEmptyTab('Workspace 1');
      this.tabs.push(tab);
      this.activeTabId = tab.id;
      this.emitTabChanges();
    }
    return this.activeTabId!;
  }

  createTab(label?: string): WorkspaceTabData {
    const tab = this.createEmptyTab(label);
    this.tabs.push(tab);
    this.emitTabChanges();
    return this.cloneTab(tab);
  }

  async switchTo(tabId: string): Promise<WorkspaceTabData | null> {
    if (tabId === this.activeTabId) {
      return this.getActiveTab();
    }

    const target = this.tabs.find((tab) => tab.id === tabId);
    if (!target) {
      return null;
    }

    this.persistActiveTabViewState();
    this.activeTabId = tabId;
    this.emitTabChanges();
    return this.cloneTab(target);
  }

  closeTab(tabId: string): WorkspaceTabData | null {
    const index = this.tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) {
      return null;
    }

    if (this.tabs.length === 1) {
      const tab = this.tabs[0];
      this.resetTab(tab);
      if (tabId === this.activeTabId) {
        this.persistActiveTabViewState();
        this.emitTabChanges();
      }
      return this.cloneTab(tab);
    }

    const closingActive = tabId === this.activeTabId;
    this.tabs.splice(index, 1);

    if (closingActive) {
      const nextIndex = Math.min(index, this.tabs.length - 1);
      this.activeTabId = this.tabs[nextIndex].id;
    }

    this.emitTabChanges();
    return this.getActiveTab();
  }

  renameTab(tabId: string, label: string): void {
    const tab = this.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      return;
    }
    const trimmed = label.trim();
    tab.label = trimmed || tab.label;
    tab.labelCustomized = true;
    this.emitTabChanges();
  }

  updateActiveTabFromFile(
    fileName: string | undefined,
    content: BurpExport | undefined,
    options?: {
      requestEdits?: Record<number, string>;
      commentEdits?: Record<number, string>;
      highlightEdits?: Record<number, RowHighlightColor | null>;
      bookmarkEdits?: Record<number, boolean>;
      viewState?: WorkspaceViewState;
      resetViewState?: boolean;
    }
  ): WorkspaceTabData {
    const tab = this.ensureActiveTab();
    const hadContent = !!tab.content || !!tab.fileName;
    tab.fileName = fileName;
    tab.content = content;
    tab.requestEdits = options?.requestEdits ?? {};
    tab.commentEdits = options?.commentEdits ?? {};
    tab.highlightEdits = options?.highlightEdits ?? {};
    tab.bookmarkEdits = options?.bookmarkEdits ?? {};

    if (options?.resetViewState) {
      tab.viewState = undefined;
    } else if (options?.viewState) {
      tab.viewState = options.viewState;
    }

    if (fileName && !tab.labelCustomized && !hadContent) {
      tab.label = this.deriveLabelFromFileName(fileName);
    } else if (!fileName && !tab.label) {
      tab.label = this.nextDefaultLabel();
    }

    this.emitTabChanges();
    return this.cloneTab(tab);
  }

  updateActiveTabEdits(
    requestEdits: Record<number, string>,
    commentEdits: Record<number, string>,
    highlightEdits: Record<number, RowHighlightColor | null> = {},
    bookmarkEdits: Record<number, boolean> = {},
  ): void {
    const tab = this.ensureActiveTab();
    tab.requestEdits = { ...requestEdits };
    tab.commentEdits = { ...commentEdits };
    tab.highlightEdits = { ...highlightEdits };
    tab.bookmarkEdits = { ...bookmarkEdits };
  }

  updateActiveTabViewState(viewState: WorkspaceViewState | undefined): void {
    const tab = this.ensureActiveTab();
    tab.viewState = viewState;
  }

  updateTab(
    tabId: string,
    data: {
      fileName?: string;
      content?: BurpExport;
      requestEdits?: Record<number, string>;
      commentEdits?: Record<number, string>;
      highlightEdits?: Record<number, RowHighlightColor | null>;
      bookmarkEdits?: Record<number, boolean>;
      viewState?: WorkspaceViewState;
      resetViewState?: boolean;
      label?: string;
      labelCustomized?: boolean;
    },
  ): WorkspaceTabData | null {
    const tab = this.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      return null;
    }

    if (data.fileName !== undefined) {
      tab.fileName = data.fileName;
    }
    if (data.content !== undefined) {
      tab.content = data.content;
    }
    if (data.requestEdits !== undefined) {
      tab.requestEdits = { ...data.requestEdits };
    }
    if (data.commentEdits !== undefined) {
      tab.commentEdits = { ...data.commentEdits };
    }
    if (data.highlightEdits !== undefined) {
      tab.highlightEdits = { ...data.highlightEdits };
    }
    if (data.bookmarkEdits !== undefined) {
      tab.bookmarkEdits = { ...data.bookmarkEdits };
    }
    if (data.resetViewState) {
      tab.viewState = undefined;
    } else if (data.viewState !== undefined) {
      tab.viewState = data.viewState;
    }
    if (data.label !== undefined) {
      tab.label = data.label;
      tab.labelCustomized = data.labelCustomized ?? true;
    }

    this.emitTabChanges();
    return this.cloneTab(tab);
  }

  restoreTab(
    fileName: string,
    content: BurpExport,
    options?: {
      label?: string;
      labelCustomized?: boolean;
      requestEdits?: Record<number, string>;
      commentEdits?: Record<number, string>;
      highlightEdits?: Record<number, RowHighlightColor | null>;
      bookmarkEdits?: Record<number, boolean>;
      viewState?: WorkspaceViewState;
    }
  ): WorkspaceTabData {
    this.tabs = [];
    const tab = this.createEmptyTab(options?.label ?? this.deriveLabelFromFileName(fileName));
    tab.labelCustomized = options?.labelCustomized ?? !!options?.label;
    tab.fileName = fileName;
    tab.content = content;
    tab.requestEdits = options?.requestEdits ?? {};
    tab.commentEdits = options?.commentEdits ?? {};
    tab.highlightEdits = options?.highlightEdits ?? {};
    tab.bookmarkEdits = options?.bookmarkEdits ?? {};
    tab.viewState = options?.viewState;
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.emitTabChanges();
    return this.cloneTab(tab);
  }

  private ensureActiveTab(): WorkspaceTabData {
    if (!this.activeTabId) {
      this.ensureInitialTab();
    }
    return this.tabs.find((tab) => tab.id === this.activeTabId)!;
  }

  flushActiveTabViewState(): void {
    this.persistActiveTabViewState();
  }

  private persistActiveTabViewState(): void {
    const tab = this.tabs.find((candidate) => candidate.id === this.activeTabId);
    if (!tab) {
      return;
    }
    const captured = this.viewStateProvider?.();
    if (captured) {
      tab.viewState = captured;
    }
  }

  private createEmptyTab(label?: string): WorkspaceTabData {
    this.tabCounter += 1;
    return {
      id: this.createTabId(),
      label: label ?? this.nextDefaultLabel(),
      labelCustomized: !!label,
      requestEdits: {},
      commentEdits: {},
      highlightEdits: {},
      bookmarkEdits: {},
    };
  }

  private resetTab(tab: WorkspaceTabData): void {
    tab.fileName = undefined;
    tab.content = undefined;
    tab.requestEdits = {};
    tab.commentEdits = {};
    tab.highlightEdits = {};
    tab.bookmarkEdits = {};
    tab.viewState = undefined;
    tab.label = this.nextDefaultLabel();
    tab.labelCustomized = false;
  }

  private nextDefaultLabel(): string {
    return `Workspace ${this.tabCounter}`;
  }

  private deriveLabelFromFileName(fileName: string): string {
    return fileName.replace(/\.xml$/i, '');
  }

  private createTabId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private emitTabChanges(): void {
    this.tabsSubject.next(this.getTabs());
    this.activeTabIdSubject.next(this.activeTabId);
  }

  private cloneTab(tab: WorkspaceTabData): WorkspaceTabData {
    return {
      id: tab.id,
      label: tab.label,
      labelCustomized: tab.labelCustomized,
      fileName: tab.fileName,
      content: tab.content,
      requestEdits: { ...tab.requestEdits },
      commentEdits: { ...tab.commentEdits },
      highlightEdits: { ...tab.highlightEdits },
      bookmarkEdits: { ...tab.bookmarkEdits },
      viewState: tab.viewState ? { ...tab.viewState } : undefined,
    };
  }
}