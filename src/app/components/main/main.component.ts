import { ChangeDetectorRef, Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { FileHandleService, BurpExport } from '../../services/file-handle/file-handle.service'
import { Subscription } from 'rxjs';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Base64 } from 'js-base64';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {

  constructor(
    private FileHandleService: FileHandleService,
    private cdr: ChangeDetectorRef
  ) { }

  fileSub!: Subscription
  selectedFileContent!: BurpExport | undefined;
  displayedColumns: string[] = ['position', 'host', 'method', 'path', 'status', 'responselength', 'mimetype', 'extension', 'title', 'comment', 'ip', 'time'];
  dataSource = new MatTableDataSource();
  ELEMENT_DATA: any = [];
  clickedRow!: any;
  wrapRequest: boolean = false;
  wrapResponse: boolean = false;
  requestSearch: string = '';
  responseSearch: string = '';
  requestMatchCount: number = 0;
  responseMatchCount: number = 0;
  requestMatchIndex: number = -1;
  responseMatchIndex: number = -1;
  requestHighlightedHeaders: { key: string; value: string; hasValue: boolean }[] = [];
  requestHighlightedBody: string = '';
  responseHighlightedHeaders: { key: string; value: string; hasValue: boolean }[] = [];
  responseHighlightedBody: string = '';

  ngOnInit(): void {
    this.fileSub = this.FileHandleService.getselectedFileDataListener()
      .subscribe((selectedFileData: { selectedFileContent: BurpExport | undefined }) => {
        if (!selectedFileData.selectedFileContent) {
          this.dataSource = new MatTableDataSource();
          this.selectedFileContent = selectedFileData.selectedFileContent;
          this.clickedRow = undefined;
          return
        }
        this.selectedFileContent = selectedFileData.selectedFileContent
        // console.log(this.selectedFileContent);
        this.elementDataGen(this.selectedFileContent)
        this.dataSource = new MatTableDataSource(this.ELEMENT_DATA);
        this.dataSource.sort = this.sort;
      })
  }

  @ViewChild(MatSort, { static: false }) sort!: MatSort;

  elementDataGen(content: any) {
    this.ELEMENT_DATA = []
    let position = 1
    content.items.item.forEach((element: any) => {
      this.ELEMENT_DATA.push(
        {
          position: position,
          ip: element.host[0].$.ip,
          host: element.protocol + '://' + element.host[0]._ + this.portAssign(element.protocol, element.port),
          port: element.port,
          protocol: element.protocol,
          method: element.method,
          status: element.status,
          path: element.path,
          responselength: element.responselength,
          comment: element.comment,
          url: element.url,
          time: element.time,
          mimetype: element.mimetype,
          extension: element.extension != 'null' ? element.extension : '',
          request: this.splitHeaderBody(this.atobReqRes(element.request)),
          response: this.splitHeaderBody(this.atobReqRes(element.response)),
          title: this.extractTitleFromHttpResponse(this.atobReqRes(element.response)),
        }
      )
      position += 1;
    });
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.displayedColumns, event.previousIndex, event.currentIndex);
  }

  private splitHeaderBody(text: any): any {
    // https://bobbyhadz.com/blog/javascript-split-string-only-on-first-instance-of-character
    let [header, ...body] = text.split(/\n\s*\n/)
    header = header.split(/\r\n/)

    // https://stackoverflow.com/a/12482991
    header.forEach((elem: string, index: string | number) => {
      let [key, ...value] = elem.split(": ")
      header[index] = [key, value.join("")]
    }, header);

    return [header, body.join("")]
  }

  private atobReqRes(query: any): string {
    try {
      if (query[0].$.base64 === 'true') {
        return Base64.decode(query[0]._ ?? "");
      }
      return query[0]._ ?? "";
    } catch (error) {
      console.log(error);
      console.log(query);
    }
    return ''
  }

  private portAssign(protocol: any, port: any): string {
    if (protocol[0] === "https" && port[0] === "443") {
      return ''
    } else if (protocol[0] === "http" && port[0] === "80") {
      return ''
    } else {
      return ':' + port
    }
  }

  private extractTitleFromHttpResponse(response: string): string {
    const titleRegex = /<title>(.*?)<\/title>/i;
    const match = response.match(titleRegex);
    if (match && match.length > 1) {
      return match[1];
    }
    return '';
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value ? (event.target as HTMLInputElement).value : "";
    this.dataSource.filter = filterValue.trim();
  }

  selectRow(row: any) {
    if (this.clickedRow !== row) {
      this.requestSearch = '';
      this.responseSearch = '';
      this.resetRequestSearchState();
      this.resetResponseSearchState();
    }
    this.clickedRow = row;
    this.updateRequestHighlights();
    this.updateResponseHighlights();
  }

  onRequestSearch(event: Event) {
    this.requestSearch = (event.target as HTMLInputElement).value;
    this.requestMatchCount = this.countPanelMatches(this.clickedRow?.request, this.requestSearch);
    this.requestMatchIndex = this.requestMatchCount > 0 ? 0 : -1;
    this.updateRequestHighlights();
    this.scheduleScrollToMatch('request');
  }

  onResponseSearch(event: Event) {
    this.responseSearch = (event.target as HTMLInputElement).value;
    this.responseMatchCount = this.countPanelMatches(this.clickedRow?.response, this.responseSearch);
    this.responseMatchIndex = this.responseMatchCount > 0 ? 0 : -1;
    this.updateResponseHighlights();
    this.scheduleScrollToMatch('response');
  }

  onRequestSearchKeydown(event: KeyboardEvent) {
    this.onPanelSearchKeydown(event, 'request');
  }

  onResponseSearchKeydown(event: KeyboardEvent) {
    this.onPanelSearchKeydown(event, 'response');
  }

  private onPanelSearchKeydown(event: KeyboardEvent, panel: 'request' | 'response') {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.navigatePanelMatch(panel, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.navigatePanelMatch(panel, -1);
    }
  }

  private navigatePanelMatch(panel: 'request' | 'response', direction: 1 | -1) {
    const matchCount = panel === 'request' ? this.requestMatchCount : this.responseMatchCount;
    if (matchCount === 0) {
      return;
    }

    if (panel === 'request') {
      this.requestMatchIndex = (this.requestMatchIndex + direction + matchCount) % matchCount;
      this.updateRequestHighlights();
    } else {
      this.responseMatchIndex = (this.responseMatchIndex + direction + matchCount) % matchCount;
      this.updateResponseHighlights();
    }

    this.scheduleScrollToMatch(panel);
  }

  private updateRequestHighlights() {
    if (!this.clickedRow) {
      this.requestHighlightedHeaders = [];
      this.requestHighlightedBody = '';
      return;
    }

    const state = { index: 0 };
    const activeIndex = this.requestMatchIndex;
    this.requestHighlightedHeaders = this.clickedRow.request[0].map((row: [string, string]) => ({
      key: this.highlightTextWithIndex(row[0], this.requestSearch, state, activeIndex),
      value: this.highlightTextWithIndex(row[1], this.requestSearch, state, activeIndex),
      hasValue: !!row[1],
    }));
    this.requestHighlightedBody = this.highlightTextWithIndex(
      this.clickedRow.request[1],
      this.requestSearch,
      state,
      activeIndex
    );
  }

  private updateResponseHighlights() {
    if (!this.clickedRow) {
      this.responseHighlightedHeaders = [];
      this.responseHighlightedBody = '';
      return;
    }

    const state = { index: 0 };
    const activeIndex = this.responseMatchIndex;
    this.responseHighlightedHeaders = this.clickedRow.response[0].map((row: [string, string]) => ({
      key: this.highlightTextWithIndex(row[0], this.responseSearch, state, activeIndex),
      value: this.highlightTextWithIndex(row[1], this.responseSearch, state, activeIndex),
      hasValue: !!row[1],
    }));
    this.responseHighlightedBody = this.highlightTextWithIndex(
      this.clickedRow.response[1],
      this.responseSearch,
      state,
      activeIndex
    );
  }

  private countPanelMatches(panelContent: any, search: string): number {
    if (!panelContent) {
      return 0;
    }

    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      return 0;
    }

    let count = 0;
    panelContent[0].forEach((row: [string, string]) => {
      count += this.countMatchesInText(row[0], trimmedSearch);
      count += this.countMatchesInText(row[1], trimmedSearch);
    });
    count += this.countMatchesInText(panelContent[1] as string, trimmedSearch);
    return count;
  }

  private countMatchesInText(text: string, search: string): number {
    if (!text) {
      return 0;
    }
    const regex = this.buildSearchRegex(search);
    if (!regex) {
      return 0;
    }
    return (text.match(regex) || []).length;
  }

  private highlightTextWithIndex(
    text: string,
    search: string,
    state: { index: number },
    activeIndex: number
  ): string {
    if (!text) {
      return '';
    }

    const escapedText = this.escapeHtml(text);
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      return escapedText;
    }

    const regex = this.buildSearchRegex(trimmedSearch);
    if (!regex) {
      return escapedText;
    }

    return escapedText.replace(regex, (match) => {
      const matchIndex = state.index++;
      const isActive = matchIndex === activeIndex;
      const classes = isActive ? 'search-highlight search-highlight-active' : 'search-highlight';
      return `<mark class="${classes}" data-match-index="${matchIndex}">${match}</mark>`;
    });
  }

  private buildSearchRegex(search: string): RegExp | null {
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      return null;
    }
    const escapedSearch = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escapedSearch, 'gi');
  }

  private scheduleScrollToMatch(panel: 'request' | 'response') {
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.scrollToActiveMatch(panel));
    });
  }

  private scrollToActiveMatch(panel: 'request' | 'response') {
    const contentId = panel === 'request' ? 'request-content' : 'response-content';
    const activeIndex = panel === 'request' ? this.requestMatchIndex : this.responseMatchIndex;
    const container = document.getElementById(contentId);
    if (!container || activeIndex < 0) {
      return;
    }

    const activeMark = container.querySelector('mark.search-highlight-active') as HTMLElement | null;
    if (!activeMark) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const markRect = activeMark.getBoundingClientRect();
    const deltaY = markRect.top - containerRect.top;
    const deltaX = markRect.left - containerRect.left;

    const targetScrollTop = container.scrollTop + deltaY - (container.clientHeight / 2) + (markRect.height / 2);
    const targetScrollLeft = container.scrollLeft + deltaX - (container.clientWidth / 2) + (markRect.width / 2);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      left: Math.max(0, targetScrollLeft),
      behavior: 'smooth',
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private resetRequestSearchState() {
    this.requestMatchCount = 0;
    this.requestMatchIndex = -1;
    this.requestHighlightedHeaders = [];
    this.requestHighlightedBody = '';
  }

  private resetResponseSearchState() {
    this.responseMatchCount = 0;
    this.responseMatchIndex = -1;
    this.responseHighlightedHeaders = [];
    this.responseHighlightedBody = '';
  }

  private clearPanelSearches() {
    this.requestSearch = '';
    this.responseSearch = '';
    this.resetRequestSearchState();
    this.resetResponseSearchState();
    const requestSearchInput = document.getElementById('request-search') as HTMLInputElement | null;
    const responseSearchInput = document.getElementById('response-search') as HTMLInputElement | null;
    if (requestSearchInput) {
      requestSearchInput.value = '';
    }
    if (responseSearchInput) {
      responseSearchInput.value = '';
    }
  }

  @HostListener('window:keydown.esc', ['$event'])
  clearclickedRow(event: KeyboardEvent) {
    event.preventDefault();
    if (this.clickedRow) {
      this.clickedRow = undefined;
      this.clearPanelSearches();
    } else {
      (document.getElementById('search') as HTMLInputElement).value = "";
      this.applyFilter(event)
    }
  }
}
