import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { FileHandleService } from './file-handle.service';
import { FileSessionStorageService } from './file-session-storage.service';
import { WorkspaceService } from '../workspace/workspace.service';

describe('FileHandleService', () => {
  let service: FileHandleService;
  let storage: jasmine.SpyObj<FileSessionStorageService>;
  let workspaceService: WorkspaceService;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  beforeEach(() => {
    storage = jasmine.createSpyObj('FileSessionStorageService', [
      'save',
      'load',
      'clear',
      'listHistory',
      'loadHistoryEntry',
      'deleteHistoryEntry',
    ]);
    storage.load.and.resolveTo(null);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    TestBed.configureTestingModule({
      providers: [
        { provide: FileSessionStorageService, useValue: storage },
        { provide: MatDialog, useValue: dialogSpy },
        WorkspaceService,
      ],
    });
    service = TestBed.inject(FileHandleService);
    workspaceService = TestBed.inject(WorkspaceService);
    workspaceService.ensureInitialTab();
    dialogSpy.open.and.returnValue({
      afterClosed: () => of({
        workspaceId: workspaceService.getActiveTabId()!,
        mode: 'replace',
      }),
    } as ReturnType<MatDialog['open']>);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('stores request edits for export', () => {
    service.setRequestEdit(2, 'GET /edited HTTP/1.1\r\n\r\n');
    expect(service.hasRequestEdit(2)).toBeTrue();
    expect(service.getRequestEdit(2)).toContain('/edited');
    service.setRequestEdit(2, null);
    expect(service.hasRequestEdit(2)).toBeFalse();
  });

  it('stores comment edits for export', () => {
    service.setCommentEdit(3, 'sqli, review');
    expect(service.hasCommentEdit(3)).toBeTrue();
    expect(service.getCommentEdit(3)).toBe('sqli, review');
    service.setCommentEdit(3, null);
    expect(service.hasCommentEdit(3)).toBeFalse();
  });

  it('clears all edits together', () => {
    service.setRequestEdit(1, 'GET / HTTP/1.1\r\n\r\n');
    service.setCommentEdit(1, 'flagged');
    service.clearEdits();
    expect(service.hasRequestEdit(1)).toBeFalse();
    expect(service.hasCommentEdit(1)).toBeFalse();
  });

  it('restores the last opened file session', async () => {
    const session = {
      fileName: 'history.xml',
      content: {
        items: {
          '$': { burpVersion: '2024.1', exportTime: '2024-01-01T00:00:00Z' },
          item: [],
        },
      },
    };
    storage.load.and.resolveTo(session);

    const restored = await service.restoreLastSession();

    expect(restored).toBeTrue();
  });

  it('clears persisted session when file is cleared', async () => {
    await service.fileClear();
    expect(storage.clear).toHaveBeenCalled();
  });

  it('imports Burp XML text from the extension bridge', async () => {
    storage.save.and.resolveTo('session-id');
    const itemCount = await service.importBurpXml('<items burpVersion="2024.1" exportTime="2024-01-01"><item></item></items>');
    expect(itemCount).toBe(1);
    expect(storage.save).toHaveBeenCalled();
  });

  it('reopens a history entry without recording a duplicate import', async () => {
    const entry = {
      id: 'session-1',
      fileName: 'history.xml',
      importedAt: '2024-01-01T00:00:00.000Z',
      itemCount: 1,
      burpVersion: '2024.1',
      exportTime: '2024-01-01T00:00:00Z',
      source: 'burp-extension' as const,
      content: {
        items: {
          '$': { burpVersion: '2024.1', exportTime: '2024-01-01T00:00:00Z' },
          item: [{}],
        },
      },
    };
    storage.loadHistoryEntry.and.resolveTo(entry);
    storage.save.and.resolveTo(null);

    const opened = await service.openHistoryEntry('session-1');

    expect(opened).toBeTrue();
    expect(storage.save).toHaveBeenCalledWith(
      { fileName: 'history.xml', content: entry.content },
      { source: undefined, rawXml: undefined, recordHistory: false }
    );
  });

  it('merges multiple selected history entries into one open session', async () => {
    const first = {
      id: 'session-1',
      fileName: 'first.xml',
      importedAt: '2024-01-01T00:00:00.000Z',
      itemCount: 1,
      burpVersion: '2024.1',
      exportTime: '2024-01-01T00:00:00Z',
      source: 'file' as const,
      content: {
        items: {
          '$': { burpVersion: '2024.1', exportTime: '2024-01-01T00:00:00Z' },
          item: [{ id: 'a' }],
        },
      },
    };
    const second = {
      id: 'session-2',
      fileName: 'second.xml',
      importedAt: '2024-01-02T00:00:00.000Z',
      itemCount: 1,
      burpVersion: '2024.1',
      exportTime: '2024-01-02T00:00:00Z',
      source: 'file' as const,
      content: {
        items: {
          '$': { burpVersion: '2024.1', exportTime: '2024-01-02T00:00:00Z' },
          item: [{ id: 'b' }],
        },
      },
    };
    storage.loadHistoryEntry.and.callFake(async (id: string) => {
      if (id === 'session-1') {
        return first;
      }
      if (id === 'session-2') {
        return second;
      }
      return null;
    });
    storage.save.and.resolveTo(null);

    const opened = await service.openHistoryEntries(['session-1', 'session-2']);

    expect(opened).toBeTrue();
    expect(storage.save).toHaveBeenCalled();
    const savedSession = storage.save.calls.mostRecent().args[0];
    expect(savedSession.fileName).toBe('first.xml + second.xml');
    expect(savedSession.content.items.item.length).toBe(2);
  });
});
