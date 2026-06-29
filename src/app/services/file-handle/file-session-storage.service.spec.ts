import { TestBed } from '@angular/core/testing';
import { FileSessionStorageService } from './file-session-storage.service';
import { BurpExport } from './file-handle.service';

describe('FileSessionStorageService', () => {
  let service: FileSessionStorageService;

  async function clearHistory(): Promise<void> {
    const history = await service.listHistory();
    for (const entry of history) {
      await service.deleteHistoryEntry(entry.id);
    }
  }

  const sampleSession = {
    fileName: 'history.xml',
    content: {
      items: {
        '$': {
          burpVersion: '2024.1',
          exportTime: '2024-01-01T00:00:00Z',
        },
        item: [],
      },
    } as BurpExport,
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FileSessionStorageService);
    await service.clear();
    await clearHistory();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('returns null when no session is stored', async () => {
    await service.clear();
    const loaded = await service.load();
    expect(loaded).toBeNull();
  });

  it('saves and loads the last opened file session', async () => {
    await service.save(sampleSession);
    const loaded = await service.load();
    expect(loaded).toEqual(sampleSession);
    await service.clear();
  });

  it('stores imported sessions in history', async () => {
    await service.save(sampleSession, { source: 'burp-extension' });
    const history = await service.listHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].source).toBe('burp-extension');
    await service.deleteHistoryEntry(history[0].id);
    await service.clear();
  });

  it('clears the stored session', async () => {
    await service.save(sampleSession);
    await service.clear();
    const loaded = await service.load();
    expect(loaded).toBeNull();
  });

  it('does not add a history entry when recordHistory is false', async () => {
    await service.save(sampleSession, { source: 'file' });
    const before = await service.listHistory();
    expect(before.length).toBe(1);

    await service.save(sampleSession, { source: 'file', recordHistory: false });
    const after = await service.listHistory();
    expect(after.length).toBe(1);

    await service.deleteHistoryEntry(before[0].id);
    await service.clear();
  });
});