import { TestBed } from '@angular/core/testing';

import { FileHandleService } from './file-handle.service';

describe('FileHandleService', () => {
  let service: FileHandleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
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
});
