import {
  AUDIENCE_PROFILE,
  chapterCount,
  type Audience,
  type Chapter,
  type Story,
} from '../types';

export const META_DELIMITER = '===META===';

/** Everything the model needs to know about where it is in the book. */
export interface ChapterContext {
  chapterNumber: number;
  totalChapters: number;
  wordTarget: number;
  isFinal: boolean;
  isNearEnd: boolean;
  needsTitle: boolean;
  /** null when none has been awarded yet — there is nothing to be too close to. */
  chaptersSinceLastAchievement: number | null;
  genreJustChanged: boolean;
}

export function buildContext(story: Story, forLastChapter = false): ChapterContext {
  const written = chapterCount(story);
  const chapterNumber = forLastChapter ? Math.max(1, written) : written + 1;
  const profile = AUDIENCE_PROFILE[story.audience];

  const lastAchievement = story.achievements.at(-1);
  const chaptersSinceLastAchievement = lastAchievement
    ? chapterNumber - lastAchievement.unlockedAtChapter
    : null;

  return {
    chapterNumber,
    totalChapters: story.totalChapters,
    wordTarget: profile.wordsPerChapter,
    isFinal: chapterNumber >= story.totalChapters,
    isNearEnd: chapterNumber >= story.totalChapters - 1,
    // The story is normally named at creation, before any prose. Chapter one is only
    // asked for a title if nothing has supplied one — a story created before titles
    // moved up front, or one whose naming call failed.
    needsTitle: !story.title.trim(),
    chaptersSinceLastAchievement,
    genreJustChanged: !forLastChapter && story.genreChangedAtChapter === written,
  };
}

/**
 * Per-audience writing rules, given as concrete constraints rather than adjectives.
 *
 * "Simple sentences, warm tone" leaves the model to guess what simple means; a stated
 * reading age, an average sentence length and a rule for unfamiliar words do not. The
 * live run showed the model follows these closely, so specificity here is worth more
 * than anywhere else in the prompt.
 */
const STYLE: Record<Audience, string[]> = {
  Children: [
    'Write for a child of about seven, reading along with an adult.',
    'Vocabulary: everyday words a young child already knows. If the story genuinely needs an unfamiliar word, make its meaning plain from the sentence around it — never stop to define it.',
    'Sentences: one idea each, around ten words on average, rarely more than a single subordinate clause. Vary the rhythm so it does not become sing-song.',
    'Paragraphs: two to four sentences.',
    'Concrete and sensory throughout. No irony, no sarcasm, and no metaphor that needs unpacking to follow the plot.',
    'Dialogue: short lines, plainly attributed ("she said", "said the baker"), one speaker per paragraph.',
    'Nothing violent or frightening. Kindness and curiosity carry the plot.',
  ],
  'Young Adults': [
    'Write for a reader of about fourteen.',
    'Vocabulary: rich and current, and never talked down to. Precise words are welcome; archaic or academic register is not, unless a character speaks that way.',
    'Sentences: vary the length deliberately. Complex constructions are fine, but keep the momentum — a long sentence should earn its length.',
    'Paragraphs: short enough to keep the page moving.',
    'Interiority matters: what the protagonist notices, fears and wants should be legible without being announced.',
    'Real stakes and real consequences. Subtext is welcome; ambiguity in small doses.',
    'No explicit sex, and no gratuitous violence — difficulty and danger are fine when they mean something.',
  ],
  Adults: [
    'The full literary range is available.',
    'Vocabulary and syntax: unconstrained. Vary sentence length for effect and trust the reader to follow.',
    'Mature themes handled with craft rather than shock. Imply more than you state.',
    'Subtext, ambiguity and unreliable impressions are all permitted.',
  ],
};

export function buildSystemPrompt(story: Story, ctx: ChapterContext): string {
  const lines = [
    'You are a novelist writing an interactive book, one chapter at a time.',
    '',
    `AUDIENCE: ${story.audience}`,
    `GENRE: ${story.genre}`,
    `SETTING: ${story.setting}`,
    '',
    `This is chapter ${ctx.chapterNumber} of ${ctx.totalChapters}. Write approximately ${ctx.wordTarget} words of prose.`,
  ];

  if (ctx.isFinal) {
    lines.push(
      'This is the FINAL chapter. Resolve every open thread and bring the story to a real ending. Do not offer any further choices.',
    );
  } else if (ctx.isNearEnd) {
    lines.push(
      'The book is nearly over. Begin converging the plot toward a satisfying resolution.',
    );
  }

  if (ctx.genreJustChanged) {
    lines.push(
      'The reader has just changed the genre or setting. Bridge the shift inside the story so it reads as a deliberate turn, not a discontinuity.',
    );
  }

  lines.push(
    '',
    'STYLE AND LANGUAGE:',
    ...STYLE[story.audience].map((rule) => `- ${rule}`),
    '',
    'CONTINUITY: honour the summary and the recent prose exactly. Never contradict an established fact, name, or voice. Write prose only — no headings, no chapter numbers, no bullet points.',
    '',
    `After the prose, output the line ${META_DELIMITER} on its own, then a single JSON object and nothing else:`,
    '{',
  );

  if (ctx.needsTitle) {
    lines.push('  "title": "the book\'s title, 2-6 words, evocative, no subtitle",');
  }

  lines.push(
    ctx.isFinal
      ? '  "actions": [],'
      : '  "actions": [four one-sentence choices for what the protagonist does next, each a concrete action, meaningfully different from one another],',
    `  "achievement": null, or {"title": "2-3 words", "description": "one sentence"} if this chapter earned a genuine milestone. ${
      ctx.chaptersSinceLastAchievement === null
        ? 'None has been awarded yet.'
        : `It has been ${ctx.chaptersSinceLastAchievement} chapter(s) since the last one.`
    } Award one only for a distinctive turn, and no more often than roughly every 5 chapters.`,
    '  "summary": "the whole plot so far in under 500 words, rewritten to include this chapter. Keep the characters, places and established facts that later chapters will need to stay consistent with"',
    '}',
  );

  return lines.join('\n');
}

/**
 * Last N words of prose, for voice and immediate continuity.
 *
 * Taken from the whole book rather than the last chapter, so the window spans chapter
 * boundaries. Achievement pages are filtered out, so an interlude does not eat into it.
 */
export function recentProse(story: Story, words = 1000): string {
  const prose = story.chapters
    .filter((c): c is Extract<Chapter, { kind: 'prose' }> => c.kind === 'prose')
    .map((c) => c.text)
    .join('\n\n');
  const parts = prose.split(/\s+/);
  return parts.length <= words ? prose : parts.slice(-words).join(' ');
}

export function buildUserPrompt(story: Story, ctx: ChapterContext, chosenAction?: string): string {
  if (ctx.chapterNumber === 1) {
    return 'Begin the book. Open chapter one.';
  }

  const sections = [
    `PLOT SO FAR:\n${story.summary || '(nothing yet)'}`,
    `RECENT PROSE (continue seamlessly from here):\n${recentProse(story)}`,
  ];

  if (story.achievements.length) {
    sections.push(
      `ACHIEVEMENTS ALREADY AWARDED (do not repeat these):\n${story.achievements
        .map((a) => `- ${a.title}: ${a.description}`)
        .join('\n')}`,
    );
  }

  sections.push(
    chosenAction
      ? `THE READER CHOSE:\n${chosenAction}\n\nWrite chapter ${ctx.chapterNumber}, following from that choice.`
      : `Write chapter ${ctx.chapterNumber}.`,
  );

  return sections.join('\n\n');
}

/**
 * Asks only for the metadata block, for a chapter whose prose already arrived but
 * whose stream died before the delimiter. Re-sending the prose is far cheaper than
 * regenerating the chapter, and the reader keeps the text they already have.
 */
export function buildRepairPrompt(ctx: ChapterContext, prose: string): string {
  return [
    `This is chapter ${ctx.chapterNumber} of ${ctx.totalChapters}, which you have already written:`,
    '',
    prose,
    '',
    `Now output ONLY the ${META_DELIMITER} line followed by the JSON object described in your instructions. Do not rewrite the chapter.`,
  ].join('\n');
}
