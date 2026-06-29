import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { formatOmittedBodySize, RequestPanelViewState } from './panel.types';

@Component({
  selector: 'app-request-panel',
  templateUrl: './request-panel.component.html',
  styleUrls: ['./panel-shared.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class RequestPanelComponent {
  @Input() view!: RequestPanelViewState;
  @Output() showView = new EventEmitter<void>();
  @Output() enableReplay = new EventEmitter<void>();
  @Output() toggleDiff = new EventEmitter<void>();
  @Output() clearCompare = new EventEmitter<void>();
  @Output() wrapToggle = new EventEmitter<void>();
  @Output() toggleInspector = new EventEmitter<void>();
  @Output() copyCurl = new EventEmitter<void>();
  @Output() copyRaw = new EventEmitter<void>();
  @Output() resetReplay = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<Event>();
  @Output() searchKeydown = new EventEmitter<KeyboardEvent>();
  @Output() diffLayoutChange = new EventEmitter<'unified' | 'side-by-side'>();
  @Output() replayRequestChange = new EventEmitter<string>();
  @Output() expandBody = new EventEmitter<void>();

  @ViewChild('searchInputRef') private searchInputRef?: ElementRef<HTMLInputElement>;

  readonly formatOmittedBodySize = formatOmittedBodySize;

  focusSearch(): void {
    const input = this.searchInputRef?.nativeElement;
    input?.focus();
    input?.select();
  }
}