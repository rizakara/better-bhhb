import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { InspectorPanelViewState } from '../panels/panel.types';

export type InspectorTab = 'attributes' | 'cookies' | 'request-headers' | 'response-headers';

@Component({
    selector: 'app-inspector-panel',
    templateUrl: './inspector-panel.component.html',
    styleUrls: ['./inspector-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class InspectorPanelComponent {
  @Input() view!: InspectorPanelViewState;
  @Output() tabChange = new EventEmitter<InspectorTab>();
  @Output() close = new EventEmitter<void>();

  setTab(tab: InspectorTab): void {
    this.tabChange.emit(tab);
  }

  onClose(): void {
    this.close.emit();
  }
}