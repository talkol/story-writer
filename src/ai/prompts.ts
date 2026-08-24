import {
  AUDIENCE_PROFILE,
  chapterCount,
  type Audience,
  type Chapter,
  type Story,
} from '../types';

export const META_DELIMITER = '===META===';

/**
 * Achievement pacing, defined once because two places need to agree: the instruction
 * given to the model, and the guard that rejects what it returns. Splitting them across
 * files is how they drift.
 *
 * The rate is set from the book lengths, not chosen in the abstract: at one per six
 * chapters, books of 6 / 12 / 20 chapters earn roughly 1 / 2 / 3 achievements. That is
 * the per-book haul the design was tuned for, preserved across the move to shorter
 * books — the previous rate of ten was calibrated against 10 / 20 / 30 chapters and
 * would now leave most Children's books with none at all.
 */
export const ACHIEVEMENT_EVERY_CHAPTERS = 6;

/**
 * Hard floor enforced client-side. The model decides *whether* a chapter earned an
 * achievement; this only stops them clustering. Set below the target so ordinary
 * variance is allowed and only runaway pacing is refused — kept at roughly 60% of the
 * target rate, as it was before the book lengths changed.
 */
export const MIN_CHAPTERS_BETWEEN_ACHIEVEMENTS = 3;

/**
 * How much of a book is spent converging on its ending, as a fraction of its length.
 *
 * A fixed one-chapter runway does not travel across book lengths: it is a sixth of a
 * Children's book and a twentieth of an adult one, so the long books got the least room
 * to land. As a fraction it comes out at 1 / 2 / 3 chapters for 6 / 12 / 20.
 */
const ENDGAME_FRACTION = 0.15;

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

/** Chapters of convergence before the final one. Always at least one. */
function endgameRunway(totalChapters: number): number {
  return Math.max(1, Math.round(totalChapters * ENDGAME_FRACTION));
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
    isNearEnd: chapterNumber >= story.totalChapters - endgameRunway(story.totalChapters),
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
 *
 * The reading age is the strongest lever of the set — it moves vocabulary, syntax and
 * imagery together, in a way that tightening any single rule does not.
 */
const STYLE: Record<Audience, string[]> = {
  Children: [
    'Write for a child of about five, listening to an adult read it aloud.',
    'Vocabulary: only everyday words a five-year-old already uses. Prefer the short, plain word over the precise one. If a word might be new, choose a simpler one instead — do not use it and then explain it.',
    'Sentences: one idea each, around eight words, and simple. Avoid subordinate clauses; where you would use one, write two short sentences instead. Vary the rhythm so it does not become sing-song.',
    'Paragraphs: two or three short sentences.',
    'Active voice and concrete nouns. Avoid abstract words for feelings and ideas — show them through what a character does.',
    'Repetition is a feature here, not a fault: repeat names, phrases and patterns the way a picture book does.',
    'Concrete and sensory throughout. No irony, no sarcasm, and no metaphor that needs unpacking to follow the plot.',
    'Dialogue: short lines, plainly attributed ("she said", "said the baker"), one speaker per paragraph.',
    'Nothing violent or frightening. Kindness and curiosity carry the plot.',
    'The four choices you offer must be written in this same simple language — they are read by the same child.',
  ],
  'Young Adults': [
    'Write for a reader of about fourteen.',
    'Vocabulary: rich and current, and never talked down to. Precise words are welcome; archaic or academic register is not, unless a character speaks that way.',
    'Sentences: around fourteen words on average, and simple in construction. Avoid complex sentences — at most one subordinate clause, and never a sentence that has to be read twice to parse. Vary the length so the rhythm does not go flat; a long sentence should be rare and earn its length.',
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

/**
 * The language brief for a *title*, per audience — one line, condensed from the
 * vocabulary rules in STYLE above.
 *
 * It lives here, next to STYLE, on purpose. `generateTitle` runs as its own call before
 * any prose exists and so never sees the chapter prompt; keeping its register in the
 * other file is how the two drift apart, leaving a book written for a five-year-old
 * sitting under a title pitched at an adult.
 */
export const TITLE_REGISTER: Record<Audience, string> = {
  Children:
    'Use only plain words a five-year-old knows. Nothing abstract and nothing figurative — a title a young child could picture.',
  'Young Adults':
    'Vivid and current, and never talked down to. No archaic or academic words.',
  Adults:
    'The full literary range is available. Suggest rather than explain.',
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
      : '  "actions": [four one-sentence choices for what the protagonist does next. Each must take the story somewhere the others cannot reach: a different place, a different person, a different method, or a different goal. Not four ways of doing the same thing, and never four routes into the same next scene — a reader who picks any one of them should get a chapter the other three could not have produced. Each is something the protagonist DOES, not something they feel or decide. Avoid options that amount to waiting, thinking it over, or asking someone else what to do: those collapse back into the chapter you were going to write anyway. Make at least one carry real risk, and at least one point somewhere the story has not been heading],',
    `  "achievement": null, or {"title": "2-3 words", "description": "one sentence"} if this chapter earned a genuine milestone. ${
      ctx.chaptersSinceLastAchievement === null
        ? 'None has been awarded yet.'
        : `It has been ${ctx.chaptersSinceLastAchievement} chapter(s) since the last one.`
    } Award one only for a genuinely distinctive turn — on average about once every ${ACHIEVEMENT_EVERY_CHAPTERS} chapters, so most chapters should return null.`,
    '  "summary": "the whole plot so far in under 1000 words, rewritten to include this chapter. Keep the characters, places and established facts that later chapters will need to stay consistent with. Record only what has happened — no plans, no predictions, no intentions for what comes next. A summary that states where the story is heading drags every later choice back toward the same ending"',
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
      ? `THE READER CHOSE:\n${chosenAction}\n\nWrite chapter ${ctx.chapterNumber}. This choice is what happens now: commit to it and let it redirect the story. Do not fold it back into the direction the earlier chapters were heading, and do not treat it as a detour that rejoins the same path — where the choice conflicts with anything the plot so far implies about what comes next, the choice wins. Continuity binds the past, not the future.`
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
