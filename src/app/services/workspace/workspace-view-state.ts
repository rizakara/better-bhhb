export interface WorkspaceViewState {
  globalSearchTerm: string;
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
  viewState?: WorkspaceViewState;
}