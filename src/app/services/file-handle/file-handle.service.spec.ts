import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';

import { FileHandleService } from './file-handle.service';
import { FileSessionStorageService } from './file-session-storage.service';

describe('FileHandleService', () => {
  let service: FileHandleService;
  let storage: jasmine.SpyObj<FileSessionStorageService>;

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

    const dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    TestBed.configureTestingModule({
      providers: [
        { provide: FileSessionStorageService, useValue: storage },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    });
    service = TestBed.inject(FileHandleService);
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
});
