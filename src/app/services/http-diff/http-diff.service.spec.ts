import { TestBed } from '@angular/core/testing';

import { HttpDiffService } from './http-diff.service';

describe('HttpDiffService', () => {
  let service: HttpDiffService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HttpDiffService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('diffs identical text as equal lines', () => {
    const diff = service.diffLines('GET /a\nHost: x', 'GET /a\nHost: x');
    expect(diff.every((line) => line.type === 'equal')).toBeTrue();
    expect(diff.length).toBe(2);
  });

  it('diffs changed lines as delete and insert', () => {
    const diff = service.diffLines('GET /a', 'GET /b');
    expect(diff).toEqual([
      { type: 'delete', text: 'GET /a', oldLineNumber: 1, newLineNumber: null },
      { type: 'insert', text: 'GET /b', oldLineNumber: null, newLineNumber: 1 },
    ]);
  });

  it('keeps unchanged lines between edits', () => {
    const diff = service.diffLines('line1\nline2\nline3', 'line1\nchanged\nline3');
    expect(diff.map((line) => line.type)).toEqual(['equal', 'delete', 'insert', 'equal']);
  });

  it('converts request parts to raw text', () => {
    const raw = service.partsToRaw([
      [['GET /path HTTP/1.1', ''], ['Host', 'example.com']],
      'body',
    ]);
    expect(raw).toBe('GET /path HTTP/1.1\nHost: example.com\n\nbody');
  });

  it('maps unified diff lines to side-by-side rows', () => {
    const unified = service.diffLines('line1\nold\nline3', 'line1\nnew\nline3');
    const rows = service.toSideBySide(unified);

    expect(rows[0].left.type).toBe('equal');
    expect(rows[0].right.type).toBe('equal');
    expect(rows[1].left.type).toBe('delete');
    expect(rows[1].right.type).toBe('empty');
    expect(rows[2].left.type).toBe('empty');
    expect(rows[2].right.type).toBe('insert');
  });
});