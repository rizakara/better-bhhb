import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AngularMaterialModule } from '../../modules/angular-material/angular-material.module';
import { BurpImportService } from '../../services/burp-import/burp-import.service';
import { FileHandleService } from '../../services/file-handle/file-handle.service';
import { ThemeService } from '../../services/theme/theme.service';
import { WorkspaceService } from '../../services/workspace/workspace.service';
import { WorkspaceTabData } from '../../services/workspace/workspace-view-state';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let exportAllWorkspacesSpy: jasmine.Spy;

  beforeEach(async () => {
    localStorage.setItem('gotIt', 'true');
    exportAllWorkspacesSpy = jasmine.createSpy('exportAllWorkspaces').and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      declarations: [HeaderComponent],
      imports: [AngularMaterialModule, NoopAnimationsModule],
      providers: [
        {
          provide: FileHandleService,
          useValue: {
            getselectedFileDataListener: () => of({ selectedFileName: '', selectedFileContent: undefined }),
            getExportFilterStateListener: () => of({
              visibleCount: 0,
              totalCount: 0,
              positions: [],
              isSubset: false,
              uniqueHosts: 0,
              statusBreakdown: { success: 0, redirect: 0, clientError: 0, serverError: 0, other: 0 },
            }),
            getImportingListener: () => of(false),
            ensureSessionRestored: () => Promise.resolve(),
            exportAllWorkspaces: exportAllWorkspacesSpy,
          },
        },
        {
          provide: ThemeService,
          useValue: {
            darkThemes: [],
            lightThemes: [],
            currentTheme: { id: 'dark', name: 'Dark' },
            setTheme: () => undefined,
          },
        },
        {
          provide: BurpImportService,
          useValue: {
            getStateListener: () => of({ status: 'idle', message: '' }),
            resetState: () => undefined,
          },
        },
        {
          provide: WorkspaceService,
          useValue: {
            getTabsListener: () => of([]),
            getActiveTabIdListener: () => of(null),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('gotIt');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not export all workspaces when only one workspace exists', () => {
    component.workspaceTabs = [{ id: '1', label: 'Workspace 1' } as WorkspaceTabData];

    component.exportAllWorkspaces();

    expect(exportAllWorkspacesSpy).not.toHaveBeenCalled();
  });

  it('should export all workspaces when multiple workspaces exist', () => {
    component.workspaceTabs = [
      { id: '1', label: 'Workspace 1' } as WorkspaceTabData,
      { id: '2', label: 'Workspace 2' } as WorkspaceTabData,
    ];

    component.exportAllWorkspaces();

    expect(exportAllWorkspacesSpy).toHaveBeenCalled();
  });
});