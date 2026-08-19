/**
 * Word-level anchors into a laid-out flow.
 *
 * The reader stores its resume position as a word offset rather than a page number:
 * page numbers are meaningless after a rotation or a font-size change, whereas the
 * word the reader stopped at is stable. These helpers convert between the two using
 * Range rectangles, which read the existing layout instead of forcing a new one.
 */

export interface WordAnchor {
  node: Text;
  start: number;
  end: number;
}

export function collectWordAnchors(root: HTMLElement): WordAnchor[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const anchors: WordAnchor[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const text = node.nodeValue ?? '';
    const word = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = word.exec(text))) {
      anchors.push({ node: node as Text, start: match.index, end: match.index + match[0].length });
    }
  }
  return anchors;
}

/** Vertical offset of a word from the top of the flow, in CSS pixels. */
export function topOfWord(root: HTMLElement, anchors: WordAnchor[], index: number): number {
  if (anchors.length === 0) return 0;
  const anchor = anchors[Math.max(0, Math.min(index, anchors.length - 1))];
  const range = document.createRange();
  range.setStart(anchor.node, anchor.start);
  range.setEnd(anchor.node, anchor.end);
  return range.getBoundingClientRect().top - root.getBoundingClientRect().top;
}

/**
 * First word at or below `y`. Binary search over anchors — ~log2(n) rect reads, so a
 * 800-word chapter costs about ten measurements rather than eight hundred.
 */
export function wordIndexAtY(root: HTMLElement, anchors: WordAnchor[], y: number): number {
  let lo = 0;
  let hi = anchors.length - 1;
  let best = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (topOfWord(root, anchors, mid) < y) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // `best` is the last word starting above y; the first word at or below it is next.
  return Math.min(best + 1, Math.max(0, anchors.length - 1));
}
