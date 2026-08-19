import Icon from './Icon';
import { useCoverUrl } from '../storage/useCoverUrl';
import type { Genre, Story } from '../types';

/**
 * Deterministic palette per genre. Drives the placeholder shown before a cover has
 * been generated and whenever generation failed, so an image-less library still reads
 * as a shelf of books rather than a grid of grey boxes.
 */
const GENRE_PALETTE: Record<Genre, [string, string]> = {
  Action: ['#8c2f1e', '#40120b'],
  Adventure: ['#1f5f4e', '#0d2a25'],
  Comedy: ['#c07c14', '#5b3405'],
  Crime: ['#2f3540', '#12151a'],
  Drama: ['#6a3a5c', '#2a1424'],
  Horror: ['#1a1a1a', '#3d0a0a'],
  Mystery: ['#243a63', '#0d1728'],
  Romance: ['#a8425e', '#4a1626'],
  'Fairy Tale': ['#4a6fa8', '#1d2c47'],
};

interface Props {
  story: Story;
}

export default function CoverTile({ story }: Props) {
  const url = useCoverUrl(story.coverImageId);
  const title = story.title || 'Untitled Story';

  if (url) {
    return (
      <div className="cover">
        <img className="cover__img" src={url} alt={`Cover of ${title}`} />
      </div>
    );
  }

  const [from, to] = GENRE_PALETTE[story.genre];
  return (
    <div
      className="cover cover--placeholder"
      style={{ background: `linear-gradient(155deg, ${from}, ${to})` }}
      role="img"
      aria-label={`${title}, no cover image`}
    >
      <div className="cover__frame">
        {/* An untitled draft would otherwise read "Untitled Story" twice, once on the
            cover and again in the caption below it. */}
        {story.title ? (
          <span className="cover__title">{story.title}</span>
        ) : (
          <span className="cover__ornament" aria-hidden="true">
            ❧
          </span>
        )}
        <span className="cover__genre">{story.genre}</span>
      </div>
    </div>
  );
}

/** The first cell of the grid. Not a story, so it does not share CoverTile's props. */
export function CreateTile() {
  return (
    <div className="cover cover--create">
      <span className="cover__plus">
        <Icon name="plus" size={30} />
      </span>
      <span className="cover__create-label">Create New</span>
    </div>
  );
}
