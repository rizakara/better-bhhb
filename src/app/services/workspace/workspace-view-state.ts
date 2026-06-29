import { RowHighlightColor } from '../row-triage/row-triage.types';

export interface WorkspaceViewState {
  globalSearchTerm: string;
  bookmarkFilterOnly: boolean;
  columnFilters: Record<string, string[] | null>;
  columnFilterOptions: Record<string, string[]>;
  activeFilterColumn: string;
  ipFilterMode: 'values' | 'range' | 'subnet';
  ipRangeStart: string;
  ipRangeEnd: string;
  ipSubnet: string;
  columnTextFilterModes: Record<string, 'values' | 'text'>;
  columnTextFilters: Record<string, string>;
  columnTextFilterBlocked: Record<string, boolean>;
  timeFilterMode: 'none' | 'absolute' | 'blocked';
  timeAbsoluteStart: string;
  timeAbsoluteEnd: string;
  dataTimeMinMs: number | null;
  dataTimeMaxMs: number | null;
  treeViewOpen: boolean;
  treeFilter: { host: string; pathPrefix: string } | null;
  selectedTreeNodeId: string | null;
  selectedRowPosition: number | null;
  compareRowPosition: number | null;
  diffMode: boolean;
  diffLayout: 'unified' | 'side-by-side';
  replayMode: boolean;
  requestSearch: string;
  responseSearch: string;
  wrapRequest: boolean;
  wrapResponse: boolean;
  inspectorTab: 'attributes' | 'cookies' | 'request-headers' | 'response-headers';
  inspectorOpen: boolean;
}

export interface WorkspaceTabData {
  id: string;
  label: string;
  labelCustomized?: boolean;
  fileName?: string;
  content?: import('../file-handle/file-handle.service').BurpExport;
  requestEdits: Record<number, string>;
  commentEdits: Record<number, string>;
  highlightEdits: Record<number, RowHighlightColor | null>;
  bookmarkEdits: Record<number, boolean>;
  viewState?: WorkspaceViewState;
}

export const WORKSPACE_BUNDLE_FORMAT_VERSION = 1;

export interface WorkspaceBundlePayload {
  label: string;
  labelCustomized?: boolean;
  fileName?: string;
  content?: import('../file-handle/file-handle.service').BurpExport;
  requestEdits: Record<number, string>;
  commentEdits: Record<number, string>;
  highlightEdits: Record<number, RowHighlightColor | null>;
  bookmarkEdits: Record<number, boolean>;
  viewState?: WorkspaceViewState;
}

export interface WorkspaceBundle {
  formatVersion: typeof WORKSPACE_BUNDLE_FORMAT_VERSION;
  kind: 'workspace';
  exportedAt: string;
  appVersion: string;
  workspace: WorkspaceBundlePayload;
}

export interface WorkspaceCollectionBundle {
  formatVersion: typeof WORKSPACE_BUNDLE_FORMAT_VERSION;
  kind: 'collection';
  exportedAt: string;
  appVersion: string;
  activeTabIndex?: number;
  workspaces: WorkspaceBundlePayload[];
}