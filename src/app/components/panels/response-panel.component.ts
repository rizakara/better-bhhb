import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { formatOmittedBodySize, ResponsePanelViewState } from './panel.types';

@Component({
  selector: 'app-response-panel',
  templateUrl: './response-panel.component.html',
  styleUrls: ['./panel-shared.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class ResponsePanelComponent {
  @Input() view!: ResponsePanelViewState;
  @Output() toggleDiff = new EventEmitter<void>();
  @Output() clearCompare = new EventEmitter<void>();
  @Output() wrapToggle = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<Event>();
  @Output() searchKeydown = new EventEmitter<KeyboardEvent>();
  @Output() diffLayoutChange = new EventEmitter<'unified' | 'side-by-side'>();
  @Output() expandBody = new EventEmitter<void>();
  @Output() copyBody = new EventEmitter<void>();

  @ViewChild('searchInputRef') private searchInputRef?: ElementRef<HTMLInputElement>;

  readonly formatOmittedBodySize = formatOmittedBodySize;

  focusSearch(): void {
    const input = this.searchInputRef?.nativeElement;
    input?.focus();
    input?.select();
  }
}