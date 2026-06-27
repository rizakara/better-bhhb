import { TestBed } from '@angular/core/testing';
import { FileHandleService } from '../file-handle/file-handle.service';
import { BurpImportService } from './burp-import.service';

describe('BurpImportService', () => {
  let service: BurpImportService;
  let fileHandleService: jasmine.SpyObj<FileHandleService>;

  beforeEach(() => {
    fileHandleService = jasmine.createSpyObj('FileHandleService', ['importBurpXml']);
    fileHandleService.importBurpXml.and.resolveTo(3);

    TestBed.configureTestingModule({
      providers: [
        { provide: FileHandleService, useValue: fileHandleService },
      ],
    });
    service = TestBed.inject(BurpImportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('detects import query parameters', () => {
    window.history.replaceState({}, '', '/?import=1&port=19876');
    expect(service.shouldAutoImportFromUrl()).toBeTrue();
  });
});