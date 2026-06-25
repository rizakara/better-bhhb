import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { MainComponent } from './main.component';
import { FileHandleService } from '../../services/file-handle/file-handle.service';
import { RequestReplayService } from '../../services/request-replay/request-replay.service';

describe('MainComponent', () => {
  let component: MainComponent;
  let fixture: ComponentFixture<MainComponent>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      declarations: [MainComponent],
      providers: [
        {
          provide: FileHandleService,
          useValue: {
            getselectedFileDataListener: () => of({ selectedFileContent: undefined }),
            onBeforeSave: () => of(undefined),
            setExportFilterState: () => undefined,
            clearEdits: () => undefined,
            hasRequestEdit: () => false,
            hasCommentEdit: () => false,
            getRequestEdit: () => undefined,
            getCommentEdit: () => undefined,
            setRequestEdit: () => undefined,
            setCommentEdit: () => undefined,
          },
        },
        {
          provide: RequestReplayService,
          useValue: {
            requestPartsToRaw: () => '',
            rawRequestToParts: () => [[], ''],
            rawRequestToCurl: () => '',
          },
        },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    localStorage.clear();
    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hides and shows columns', () => {
    component.toggleColumnVisibility('mimetype', false);
    component.toggleColumnVisibility('title', false);

    expect(component.isColumnVisible('mimetype')).toBeFalse();
    expect(component.isColumnVisible('title')).toBeFalse();
    expect(component.displayedColumns).not.toContain('mimetype');
    expect(component.displayedColumns).not.toContain('title');
    expect(component.hiddenColumnCount).toBe(2);
  });

  it('prevents hiding the last visible column', () => {
    component.columnOrder.forEach((key) => component.toggleColumnVisibility(key, false));

    expect(component.displayedColumns.length).toBe(1);
    expect(snackBar.open).toHaveBeenCalled();
  });

  it('persists column layout to localStorage', () => {
    component.toggleColumnVisibility('mimetype', false);
    component.toggleColumnVisibility('title', false);

    const stored = JSON.parse(localStorage.getItem('bhhb-table-column-layout') ?? '{}');
    expect(stored.hidden).toEqual(['mimetype', 'title']);
    expect(stored.order).toEqual(component.columnOrder);
  });

  it('restores column layout from localStorage', () => {
    localStorage.setItem('bhhb-table-column-layout', JSON.stringify({
      order: ['position', 'method', 'host', 'path', 'status', 'responselength', 'mimetype', 'extension', 'title', 'comment', 'ip', 'time'],
      hidden: ['mimetype', 'title'],
    }));

    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.displayedColumns.indexOf('method')).toBeLessThan(component.displayedColumns.indexOf('host'));
    expect(component.isColumnVisible('mimetype')).toBeFalse();
    expect(component.isColumnVisible('title')).toBeFalse();
  });

  it('persists column order after drag-and-drop', () => {
    const visible = [...component.displayedColumns];
    const hostIndex = visible.indexOf('host');
    const methodIndex = visible.indexOf('method');
    const dropEvent = {
      previousIndex: methodIndex,
      currentIndex: hostIndex,
    } as CdkDragDrop<string[]>;

    component.drop(dropEvent);

    const stored = JSON.parse(localStorage.getItem('bhhb-table-column-layout') ?? '{}');
    expect(stored.order.indexOf('host')).toBeLessThan(stored.order.indexOf('method'));
  });

  it('resetColumnLayout restores defaults', () => {
    component.toggleColumnVisibility('mimetype', false);
    component.drop({
      previousIndex: 1,
      currentIndex: 3,
    } as CdkDragDrop<string[]>);

    component.resetColumnLayout();

    expect(component.hiddenColumns.size).toBe(0);
    expect(component.columnOrder).toEqual([
      'position',
      'host',
      'method',
      'path',
      'status',
      'responselength',
      'mimetype',
      'extension',
      'title',
      'comment',
      'ip',
      'time',
    ]);
  });
});