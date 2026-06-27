import { Injectable } from '@angular/core';

export type DiffLineType = 'equal' | 'insert' | 'delete';

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export type SideBySideCellType = 'equal' | 'delete' | 'insert' | 'empty';

export interface SideBySideCell {
  lineNumber: number | null;
  text: string;
  type: SideBySideCellType;
}

export interface SideBySideRow {
  left: SideBySideCell;
  right: SideBySideCell;
}

@Injectable({
  providedIn: 'root'
})
export class HttpDiffService {

  diffLines(left: string, right: string): DiffLine[] {
    const leftLines = this.splitLines(left);
    const rightLines = this.splitLines(right);
    const lcs = this.longestCommonSubsequence(leftLines, rightLines);
    const result: DiffLine[] = [];
    let leftIndex = 0;
    let rightIndex = 0;
    let oldLineNumber = 1;
    let newLineNumber = 1;

    for (const entry of lcs) {
      while (leftIndex < entry.leftIndex) {
        result.push({
          type: 'delete',
          text: leftLines[leftIndex],
          oldLineNumber,
          newLineNumber: null,
        });
        leftIndex += 1;
        oldLineNumber += 1;
      }

      while (rightIndex < entry.rightIndex) {
        result.push({
          type: 'insert',
          text: rightLines[rightIndex],
          oldLineNumber: null,
          newLineNumber,
        });
        rightIndex += 1;
        newLineNumber += 1;
      }

      result.push({
        type: 'equal',
        text: leftLines[leftIndex],
        oldLineNumber,
        newLineNumber,
      });
      leftIndex += 1;
      rightIndex += 1;
      oldLineNumber += 1;
      newLineNumber += 1;
    }

    while (leftIndex < leftLines.length) {
      result.push({
        type: 'delete',
        text: leftLines[leftIndex],
        oldLineNumber,
        newLineNumber: null,
      });
      leftIndex += 1;
      oldLineNumber += 1;
    }

    while (rightIndex < rightLines.length) {
      result.push({
        type: 'insert',
        text: rightLines[rightIndex],
        oldLineNumber: null,
        newLineNumber,
      });
      rightIndex += 1;
      newLineNumber += 1;
    }

    return result;
  }

  toSideBySide(lines: DiffLine[]): SideBySideRow[] {
    return lines.map((line) => {
      if (line.type === 'equal') {
        return {
          left: { lineNumber: line.oldLineNumber, text: line.text, type: 'equal' },
          right: { lineNumber: line.newLineNumber, text: line.text, type: 'equal' },
        };
      }

      if (line.type === 'delete') {
        return {
          left: { lineNumber: line.oldLineNumber, text: line.text, type: 'delete' },
          right: { lineNumber: null, text: '', type: 'empty' },
        };
      }

      return {
        left: { lineNumber: null, text: '', type: 'empty' },
        right: { lineNumber: line.newLineNumber, text: line.text, type: 'insert' },
      };
    });
  }

  partsToRaw(parts: [Array<[string, string]>, string]): string {
    if (!parts) {
      return '';
    }

    const headerLines = (parts[0] ?? []).map((row) => {
      const [key, value] = row;
      if (value === undefined || value === '') {
        return key;
      }
      return `${key}: ${value}`;
    });

    const body = parts[1] ?? '';
    if (!headerLines.length) {
      return body;
    }
    if (!body) {
      return headerLines.join('\n');
    }
    return `${headerLines.join('\n')}\n\n${body}`;
  }

  private splitLines(text: string): string[] {
    if (!text) {
      return [];
    }
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalized.split('\n');
  }

  private longestCommonSubsequence(
    leftLines: string[],
    rightLines: string[],
  ): Array<{ leftIndex: number; rightIndex: number }> {
    const leftLength = leftLines.length;
    const rightLength = rightLines.length;
    const table: number[][] = Array.from({ length: leftLength + 1 }, () =>
      Array(rightLength + 1).fill(0)
    );

    for (let leftIndex = leftLength - 1; leftIndex >= 0; leftIndex -= 1) {
      for (let rightIndex = rightLength - 1; rightIndex >= 0; rightIndex -= 1) {
        if (leftLines[leftIndex] === rightLines[rightIndex]) {
          table[leftIndex][rightIndex] = table[leftIndex + 1][rightIndex + 1] + 1;
        } else {
          table[leftIndex][rightIndex] = Math.max(
            table[leftIndex + 1][rightIndex],
            table[leftIndex][rightIndex + 1],
          );
        }
      }
    }

    const result: Array<{ leftIndex: number; rightIndex: number }> = [];
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < leftLength && rightIndex < rightLength) {
      if (leftLines[leftIndex] === rightLines[rightIndex]) {
        result.push({ leftIndex, rightIndex });
        leftIndex += 1;
        rightIndex += 1;
      } else if (table[leftIndex + 1][rightIndex] >= table[leftIndex][rightIndex + 1]) {
        leftIndex += 1;
      } else {
        rightIndex += 1;
      }
    }

    return result;
  }
}