import { deleteCover } from './covers.idb';
import { getStory, removeStory } from './stories';

/**
 * Removes a story and its cover blob together. Deleting the record alone would leave
 * an orphaned image in IndexedDB consuming quota with nothing referencing it.
 */
export async function deleteStoryAndCover(id: string): Promise<void> {
  const coverId = getStory(id)?.coverImageId ?? null;
  removeStory(id);
  if (coverId) {
    // The record is already gone; a failed blob delete is a leak, not a broken app.
    await deleteCover(coverId).catch((err) => console.warn('[library] cover delete failed', err));
  }
}
