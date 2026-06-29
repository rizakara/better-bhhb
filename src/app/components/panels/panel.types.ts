import { DiffLine, SideBySideRow } from '../../services/http-diff/http-diff.service';
import { HttpHeaderRow, ParsedCookie } from '../../services/request-replay/request-replay.service';
import { InspectorTab } from '../inspector/inspector-panel.component';

export interface HighlightedHeaderRow {
  key: string;
  value: string;
  hasValue: boolean;
}

export interface RequestPanelViewState {
  position: number;
  loading: boolean;
  replayMode: boolean;
  diffMode: boolean;
  diffLayout: 'unified' | 'side-by-side';
  wrap: boolean;
  inspectorOpen: boolean;
  compareSummaryLabel: string;
  hasCompareRow: boolean;
  comparePosition: number | null;
  requestIsEdited: boolean;
  replayRequestDirty: boolean;
  replayRequestRaw: string;
  searchTerm: string;
  matchCount: number;
  matchIndex: number;
  diffStats: string;
  diffLines: DiffLine[];
  sideBySideRows: SideBySideRow[];
  highlightedHeaders: HighlightedHeaderRow[];
  highlightedBody: string;
  bodyTruncated: boolean;
  bodyOmittedSize: number;
}

export interface ResponsePanelViewState {
  loading: boolean;
  diffMode: boolean;
  diffLayout: 'unified' | 'side-by-side';
  wrap: boolean;
  compareSummaryLabel: string;
  hasCompareRow: boolean;
  clickedPosition: number | null;
  comparePosition: number | null;
  searchTerm: string;
  matchCount: number;
  matchIndex: number;
  diffStats: string;
  diffLines: DiffLine[];
  sideBySideRows: SideBySideRow[];
  highlightedHeaders: HighlightedHeaderRow[];
  highlightedBody: string;
  bodyTruncated: boolean;
  bodyOmittedSize: number;
}

export interface InspectorPanelViewState {
  tab: InspectorTab;
  attributes: Array<{ name: string; value: string }>;
  requestCookies: ParsedCookie[];
  requestHeaders: HttpHeaderRow[];
  responseHeaders: HttpHeaderRow[];
}

export function createEmptyRequestPanelView(): RequestPanelViewState {
  return {
    position: 0,
    loading: false,
    replayMode: false,
    diffMode: false,
    diffLayout: 'unified',
    wrap: false,
    inspectorOpen: true,
    compareSummaryLabel: '',
    hasCompareRow: false,
    comparePosition: null,
    requestIsEdited: false,
    replayRequestDirty: false,
    replayRequestRaw: '',
    searchTerm: '',
    matchCount: 0,
    matchIndex: -1,
    diffStats: '',
    diffLines: [],
    sideBySideRows: [],
    highlightedHeaders: [],
    highlightedBody: '',
    bodyTruncated: false,
    bodyOmittedSize: 0,
  };
}

export function createEmptyResponsePanelView(): ResponsePanelViewState {
  return {
    loading: false,
    diffMode: false,
    diffLayout: 'unified',
    wrap: false,
    compareSummaryLabel: '',
    hasCompareRow: false,
    clickedPosition: null,
    comparePosition: null,
    searchTerm: '',
    matchCount: 0,
    matchIndex: -1,
    diffStats: '',
    diffLines: [],
    sideBySideRows: [],
    highlightedHeaders: [],
    highlightedBody: '',
    bodyTruncated: false,
    bodyOmittedSize: 0,
  };
}

export function createEmptyInspectorPanelView(): InspectorPanelViewState {
  return {
    tab: 'attributes',
    attributes: [],
    requestCookies: [],
    requestHeaders: [],
    responseHeaders: [],
  };
}

export function formatOmittedBodySize(charCount: number): string {
  if (charCount < 1024) {
    return `${charCount} characters`;
  }
  const kb = charCount / 1024;
  if (kb < 1024) {
    return kb < 100 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  return mb < 100 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}