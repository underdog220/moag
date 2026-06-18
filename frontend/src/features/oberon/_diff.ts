// Zeilenbasierter Diff (LCS) fuer die DSGVO-Revision: zeigt, welche Zeilen sich
// zwischen Original und anonymisierter Fassung unterscheiden — also was
// anonymisiert wurde. Zeilen-Granularitaet (nicht Wort) haelt es performant
// auch bei mehreren tausend Zeilen.

export interface DiffLine {
  text: string;
  changed: boolean;
}

export interface DiffResult {
  left: DiffLine[]; // Original
  right: DiffLine[]; // Anonymisiert
  // true, wenn der Diff wegen Groesse uebersprungen wurde (alles unmarkiert).
  skipped: boolean;
}

// Sicherheitsobergrenze: oberhalb wird kein O(n*m)-LCS gerechnet.
const MAX_LINES = 4000;

/**
 * Markiert geaenderte Zeilen via LCS. Zeilen, die im jeweils anderen Text via
 * laengster gemeinsamer Teilsequenz keinen Partner haben, gelten als geaendert.
 */
export function diffLines(a: string, b: string): DiffResult {
  const aLines = a.split("\n");
  const bLines = b.split("\n");

  if (aLines.length > MAX_LINES || bLines.length > MAX_LINES) {
    return {
      left: aLines.map((text) => ({ text, changed: false })),
      right: bLines.map((text) => ({ text, changed: false })),
      skipped: true,
    };
  }

  const n = aLines.length;
  const m = bLines.length;

  // LCS-DP-Tabelle (n+1) x (m+1).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        aLines[i] === bLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const left: DiffLine[] = aLines.map((text) => ({ text, changed: true }));
  const right: DiffLine[] = bLines.map((text) => ({ text, changed: true }));

  // Backtrack: gematchte Zeilen als unveraendert markieren.
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      left[i].changed = false;
      right[j].changed = false;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  return { left, right, skipped: false };
}
