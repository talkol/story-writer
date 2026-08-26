import type { Story } from '../types';

/**
 * Development fixtures. Milestones 2-4 (Library, Genre, Read, pagination, page-turn)
 * are all built against these, so no screen is blocked on the AI client landing.
 * Prose lengths are realistic for their audience so pagination is exercised honestly.
 */

const HOUR = 3_600_000;
const NOW = 1_755_000_000_000; // fixed timestamp: fixtures must not drift between reloads

const LANTERN_P1 = `The bell in the drowned tower rang three times, and Mira counted every one.

She had been told the tower was silent. Everyone in Ashmoor told her that — the bakers, the ferrymen, her aunt with her ledger of small certainties. The tower had gone under when the river changed its mind sixty years ago, and a bell underwater does not ring. And yet here she was on the flooded causeway at the grey hour before dawn, with the water at her knees and the sound still moving through her ribs like something looking for a door.

Three rings meant a ship. Her grandfather had taught her the old harbour codes before he stopped speaking altogether, tapping them out on the arm of his chair. One ring, a warning. Two, a death. Three, a ship coming in that no one was expecting.

Mira looked out at the estuary. There was nothing on the water but mist and the broken teeth of the old sea wall.

"You'll catch something out here," said a voice behind her, "and it won't be fish."

She turned. A boy about her own age stood on the dry end of the causeway, holding a lantern that gave no light — the glass was there, the wick was there, but the flame inside it was a small steady dark, like a hole cut in the morning. He seemed entirely untroubled by this.

"You heard it too," Mira said. It was not a question.

"I hear it every day." He lifted the lantern slightly, and the dark inside it swung. "That's the trouble with being the one who rings it."

The water pulled at her legs, insistent now, colder than it had been a moment ago. Somewhere behind the mist the third ring was still fading, and Mira realised she had been wrong about which direction it came from. Not from the tower at all. From further out. From the place where the charts of Ashmoor simply stopped and the mapmakers had written, in a small apologetic hand, *no soundings taken*.

"What ship," she said.

The boy smiled, and it was not unkind, which was somehow worse.

"Yours," he said.`;

const LANTERN_P2 = `Mira did not take the lantern. That was the first thing, and afterwards she would think about it often — that there had been a moment when she had simply stood in the cold water and not reached out, and that the whole rest of it had unfolded from that small refusal.

"I don't want it," she said.

"Nobody wants it." The boy set it down on the stones between them, where the dark inside the glass went on burning steadily. "That's rather the point. It goes to whoever's still standing there when the ringing stops."

"Then I'll leave."

"You will," he agreed. "Everyone does. That's how it finds you."

She left. She walked back up the causeway past him, past the lantern, past the flooded steps where the mussels grew in black seams, and she did not look back until she reached the top of the sea stairs, and when she looked back the causeway was empty and the tide had covered it entirely and there was no boy and no light and no dark.

The lantern was in her hand.

Mira did not remember picking it up. She examined this fact carefully, the way her aunt examined a column of figures that would not add — turning it, checking it, refusing to be hurried into panic by it. Her fingers were closed around a handle of cold iron. The glass was fogged from the inside. The flame of darkness inside moved when she moved, unhurried, patient, entirely at home.

In Ashmoor the morning had started without her. Smoke from the bakehouse, a dog barking at gulls, her aunt's window still shuttered. Ordinary things, and Mira walked among them holding an impossible thing, and nobody looked at her twice.

She found, over the next hour, that this was not luck. A ferryman looked directly at the lantern and his eyes slid off it like water off oilcloth. A child pointed at her, opened her mouth, then frowned and forgot what she had meant to say. The lantern did not want to be seen, and what the lantern wanted, the world seemed politely willing to arrange.

By the time the sun cleared the estuary, Mira had understood two things.

The first was that she was now the one who rang the bell.

The second was that somewhere out past the edge of the charts, something had heard three rings and was, at this moment, coming in.`;

const LANTERN_P3 = `Her aunt's house smelled of ink and old apples. Mira set the lantern on the table between the ledgers, and waited to see whether it would be seen.

Aunt Sevrin looked up. She looked at the lantern. Her pen stopped.

"Ah," she said.

That single syllable undid more of Mira's certainty than the whole impossible morning had. She had prepared herself for disbelief and had not prepared herself at all for recognition.

"You know what it is."

"I know what it costs." Sevrin capped her ink with the great care of a woman keeping her hands busy so they would not shake. "Your grandfather carried it for eleven years. He set it down once, at the end, and that is why he stopped speaking — not illness, whatever the physicians told you. You cannot put it down and keep your voice. It takes something on the way out."

"Then how do I —"

"You don't." Sevrin's mouth was a hard line. "You carry it until you find the next one standing on the causeway when the ringing stops. That is the whole of it, Mira. That is the entire, wretched arithmetic."

Mira thought of the boy, untroubled, holding out the dark. *Nobody wants it. That's rather the point.* She thought about how easy it would be, tomorrow, to walk down to the causeway at the grey hour and wait for someone else to come out of the mist.

"What happens if nobody comes?"

Her aunt did not answer at once. Outside, gulls turned over the estuary, and the light on the water was the flat pewter of a day deciding whether to storm.

"Then the ship comes in," Sevrin said, "and there is no one holding the light to tell it where the rocks are."

She reached across the ledgers and, for the first time Mira could remember, took her niece's hand.

"Your grandfather rang three bells the night he set it down," she said. "Three rings. A ship no one expected. It has been out there ever since, Mira. Sixty years, circling in the dark past the edge of the charts, waiting for someone to finish what he started."`;

export const FIXTURE_STORIES: Story[] = [
  {
    id: 'fixture-lantern',
    title: 'The Lantern of Drowned Bells',
    coverImageId: null,
    audience: 'Young Adults',
    genre: 'Mystery',
    setting: 'Fantasy',
    totalChapters: 12,
    chapters: [
      { kind: 'prose', index: 0, text: LANTERN_P1 },
      {
        kind: 'prose',
        index: 1,
        text: LANTERN_P2,
        chosenAction: 'Refuse the lantern and walk back up the causeway.',
      },
      { kind: 'achievement', index: 2, achievementId: 'ach-refusal' },
      {
        kind: 'prose',
        index: 3,
        text: LANTERN_P3,
        chosenAction: "Take the lantern home and show it to your aunt.",
      },
    ],
    achievements: [
      {
        id: 'ach-refusal',
        title: 'The First Refusal',
        description: 'You turned down a gift that no one has ever turned down before.',
        unlockedAtChapter: 2,
      },
    ],
    pendingActions: [
      'Ask Aunt Sevrin what your grandfather was trying to finish.',
      'Go down to the causeway tonight and wait for the ringing to stop.',
      'Row out past the edge of the charts and meet the ship yourself.',
      'Search your grandfather’s room for the harbour codes he never taught you.',
    ],
    cast: [
      {
        name: 'Mira Auldwen',
        bio: 'A ferryman’s daughter in the flooded town of Ashmoor, seventeen and already known for going where she is told not to. She asks the question everyone else has agreed to leave alone.',
      },
      {
        name: 'Sevrin Auldwen',
        bio: 'Mira’s aunt, who keeps the harbour ledgers and a great many things besides. She has spent thirty years making the past sound tidier than it was.',
      },
      {
        name: 'Tolm',
        bio: 'The boy on the causeway, carrying a lantern that burns dark. He is entirely untroubled by it, which is the most frightening thing about him.',
      },
      {
        name: 'Halder Auldwen',
        bio: 'Mira’s grandfather, who rang three bells sixty years ago and set the lantern down. He has not spoken since, and writes only when the tide is out.',
      },
      {
        name: 'Nessa Cobb',
        bio: 'The bellwright’s widow, the only one in Ashmoor who still counts the rings. Sharp, unsentimental, and the first to believe Mira.',
      },
    ],
    summary:
      'Mira, a girl in the flooded town of Ashmoor, hears three bells from a tower that has been underwater for sixty years — the old harbour code for an unexpected ship. On the causeway she meets a boy carrying a lantern that burns darkness instead of light. She refuses it; it comes to her anyway, and the world politely refuses to see it. Her aunt Sevrin recognises the lantern: Mira’s grandfather carried it for eleven years and lost his voice setting it down. It cannot be put down safely, only passed on. Sixty years ago he rang three bells and abandoned the light, and the ship he summoned has been circling beyond the charts ever since, waiting.',
    status: 'reading',
    readingPosition: { chapterIndex: 3, wordOffset: 0 },
    createdAt: NOW - 72 * HOUR,
    updatedAt: NOW - 2 * HOUR,
  },
  {
    id: 'fixture-biscuit',
    title: 'Biscuit and the Very Tall Ladder',
    coverImageId: null,
    audience: 'Children',
    genre: 'Adventure',
    setting: 'Nature',
    totalChapters: 6,
    chapters: [
      {
        kind: 'prose',
        index: 0,
        text: `Biscuit was a small brown rabbit with one ear that stood up and one ear that did not.\n\nEvery morning he sat at the bottom of the great oak tree and looked up. Right at the very top, higher than the crows went, there was a single golden apple. Nobody knew how it got there. Nobody could reach it.\n\n"You will never reach it," said the crows, who were rude.\n\n"Probably not," Biscuit agreed. "But I have a ladder."\n\nHe did not have a ladder. He had an idea about a ladder, which is nearly the same thing if you are brave and slightly foolish, and Biscuit was both.`,
      },
    ],
    achievements: [],
    pendingActions: [
      'Ask the badger to help build the ladder.',
      'Try climbing the tree without any ladder at all.',
      'Follow the crows to find out where the apple came from.',
      'Wait until night, when the tree might be sleepy.',
    ],
    cast: [
      {
        name: 'Biscuit',
        bio: 'A small rabbit with one floppy ear who lives under the roots of the great oak. He says yes to things before he has worked out how.',
      },
      {
        name: 'Pockle',
        bio: 'An old badger who digs the deepest holes in the wood. He grumbles at everyone and helps them anyway.',
      },
      {
        name: 'Wren',
        bio: 'A very small bird who sees everything from the top of the tree. She tells Biscuit what is up there, one word at a time.',
      },
      {
        name: 'Grib',
        bio: 'The loudest of the crows, who thinks the golden apple belongs to him. He laughs first and looks second.',
      },
      {
        name: 'Mother Thistle',
        bio: 'The hedgehog who mends things at the edge of the meadow. She has never once been in a hurry.',
      },
    ],
    summary:
      'Biscuit, a small rabbit with one floppy ear, wants a golden apple at the top of a great oak tree that nobody can reach. The crows mock him. He claims to have a ladder, which he does not.',
    status: 'reading',
    readingPosition: { chapterIndex: 0, wordOffset: 0 },
    createdAt: NOW - 200 * HOUR,
    updatedAt: NOW - 40 * HOUR,
  },
  {
    id: 'fixture-unstarted',
    title: 'Nine Grams of Nothing',
    coverImageId: null,
    audience: 'Adults',
    genre: 'Crime',
    setting: 'Urban',
    totalChapters: 20,
    chapters: [],
    achievements: [],
    pendingActions: [],
    cast: [
      {
        name: 'Odile Marchetti',
        bio: 'A night-shift dispatcher for a private ambulance firm, and the only person who hears the city before the police do. She has learned exactly how much not to write down.',
      },
      {
        name: 'Emmerich Sarr',
        bio: 'A pawnbroker on Halsey Street who has outlived three sets of partners. He is unfailingly polite and has never once raised his voice.',
      },
      {
        name: 'Junie Okonkwo-Reyes',
        bio: 'A forensic accountant seconded to a case nobody wants closed. She reads people the way she reads a ledger, slowly and without blinking.',
      },
      {
        name: 'Del Varga',
        bio: 'A tow-truck driver who moves more than cars. Cheerful, incurious by policy, and owed favours by half the district.',
      },
      {
        name: 'Inspector Rusanov',
        bio: 'Eleven months from a pension he intends to collect. He has stopped asking questions whose answers would require paperwork.',
      },
    ],
    summary: '',
    status: 'draft',
    readingPosition: { chapterIndex: 0, wordOffset: 0 },
    createdAt: NOW - HOUR,
    updatedAt: NOW - HOUR,
  },
];
