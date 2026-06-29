import { TestBed } from '@angular/core/testing';
import { WorkspaceService } from './workspace.service';
import { WorkspaceViewState } from './workspace-view-state';

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  const sampleViewState = (): WorkspaceViewState => ({
    globalSearchTerm: 'login',
    bookmarkFilterOnly: false,
    highlightFilterColors: ['red', 'green'],
    columnFilters: { host: ['https://example.com'] },
    columnFilterOptions: { host: ['https://example.com'] },
    activeFilterColumn: 'host',
    ipFilterMode: 'values',
    ipRangeStart: '',
    ipRangeEnd: '',
    ipSubnet: '',
    columnTextFilterModes: { path: 'values', title: 'values', comment: 'values' },
    columnTextFilters: { path: '', title: '', comment: '' },
    columnTextFilterBlocked: { path: false, title: false, comment: false },
    timeFilterMode: 'none',
    timeAbsoluteStart: '',
    timeAbsoluteEnd: '',
    dataTimeMinMs: null,
    dataTimeMaxMs: null,
    treeViewOpen: false,
    treeFilter: null,
    selectedTreeNodeId: null,
    selectedRowPosition: 3,
    compareRowPosition: null,
    diffMode: false,
    diffLayout: 'unified',
    replayMode: false,
    requestSearch: '',
    responseSearch: '',
    wrapRequest: false,
    wrapResponse: false,
    inspectorTab: 'attributes',
    inspectorOpen: true,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorkspaceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('creates an initial workspace tab', () => {
    const tabId = service.ensureInitialTab();
    expect(tabId).toBeTruthy();
    expect(service.getTabs().length).toBe(1);
  });

  it('preserves view state when switching tabs', async () => {
    service.registerViewStateProvider(() => sampleViewState());
    service.ensureInitialTab();
    const firstTabId = service.getActiveTabId()!;
    service.updateActiveTabFromFile('prod.xml', { items: { '$': { burpVersion: '1', exportTime: 'now' }, item: [] } });

    const secondTab = service.createTab('staging');
    await service.switchTo(secondTab.id);
    service.updateActiveTabFromFile('staging.xml', { items: { '$': { burpVersion: '1', exportTime: 'now' }, item: [] } }, {
      viewState: { ...sampleViewState(), globalSearchTerm: 'api' },
    });

    await service.switchTo(firstTabId);

    const restored = service.getActiveTab();
    expect(restored?.viewState?.globalSearchTerm).toBe('login');
    expect(restored?.fileName).toBe('prod.xml');
  });

  it('keeps a renamed workspace label after importing a file', () => {
    service.ensureInitialTab();
    const tabId = service.getActiveTabId()!;
    service.renameTab(tabId, 'prod audit');
    service.updateActiveTabFromFile('staging-export.xml', {
      items: { '$': { burpVersion: '1', exportTime: 'now' }, item: [] },
    });

    expect(service.getActiveTab()?.label).toBe('prod audit');
  });

  it('closes a tab and activates a neighbor', () => {
    service.ensureInitialTab();
    const second = service.createTab('staging');
    service.closeTab(second.id);

    expect(service.getTabs().length).toBe(1);
    expect(service.getActiveTabId()).toBe(service.getTabs()[0].id);
  });

  it('updates a tab by id without activating it', () => {
    service.ensureInitialTab();
    const second = service.createTab('staging');
    const updated = service.updateTab(second.id, {
      fileName: 'staging.xml',
      content: { items: { '$': { burpVersion: '1', exportTime: 'now' }, item: [] } },
      requestEdits: { 1: 'GET / HTTP/1.1\r\n\r\n' },
      commentEdits: { 1: 'review' },
      label: 'staging audit',
      labelCustomized: true,
    });

    expect(updated?.label).toBe('staging audit');
    expect(updated?.fileName).toBe('staging.xml');
    expect(service.getActiveTabId()).not.toBe(second.id);
    expect(service.getTabs().find((tab) => tab.id === second.id)?.requestEdits[1]).toContain('GET /');
  });
});