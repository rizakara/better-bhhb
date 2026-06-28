import { Component, EventEmitter, Input, Output } from '@angular/core';
import { HttpHeaderRow, ParsedCookie } from '../../services/request-replay/request-replay.service';

export type InspectorTab = 'attributes' | 'cookies' | 'request-headers' | 'response-headers';

@Component({
  selector: 'app-inspector-panel',
  templateUrl: './inspector-panel.component.html',
  styleUrls: ['./inspector-panel.component.css'],
})
export class InspectorPanelComponent {
  @Input() tab: InspectorTab = 'attributes';
  @Input() attributes: Array<{ name: string; value: string }> = [];
  @Input() requestCookies: ParsedCookie[] = [];
  @Input() requestHeaders: HttpHeaderRow[] = [];
  @Input() responseHeaders: HttpHeaderRow[] = [];
  @Output() tabChange = new EventEmitter<InspectorTab>();
  @Output() close = new EventEmitter<void>();

  setTab(tab: InspectorTab): void {
    this.tabChange.emit(tab);
  }

  onClose(): void {
    this.close.emit();
  }
}