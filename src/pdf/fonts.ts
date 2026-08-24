import regularUrl from './fonts/literata-regular.ttf?url';
import boldUrl from './fonts/literata-bold.ttf?url';
import italicUrl from './fonts/literata-italic.ttf?url';

/**
 * Embeds Literata into the document so the PDF is set in a book face rather than
 * jsPDF's built-in Times.
 *
 * It is not the reader's own face. On screen the app uses `ui-serif`, which resolves
 * to New York on Apple platforms — an Apple system font, which cannot be redistributed
 * inside a PDF and is not available as a file to embed. Literata is the closest
 * freely-licensed match: a book face designed for on-screen reading, with similar
 * proportions and colour.
 *
 * The three faces are separate assets fetched at export time, not inlined, so they
 * cost nothing until someone exports.
 */
export const PDF_FONT = 'Literata';

const FACES: Array<{ url: string; style: 'normal' | 'bold' | 'italic'; file: string }> = [
  { url: regularUrl, style: 'normal', file: 'Literata-Regular.ttf' },
  { url: boldUrl, style: 'bold', file: 'Literata-Bold.ttf' },
  { url: italicUrl, style: 'italic', file: 'Literata-Italic.ttf' },
];

let cache: Array<{ file: string; style: string; base64: string }> | null = null;

async function loadFaces() {
  if (cache) return cache;
  cache = await Promise.all(
    FACES.map(async ({ url, style, file }) => {
      const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < buf.length; i += CHUNK) {
        binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
      }
      return { file, style, base64: btoa(binary) };
    }),
  );
  return cache;
}

/**
 * Registers the faces on a document. Returns false if the fonts could not be fetched,
 * so the caller can fall back to a built-in rather than fail the whole export.
 */
export async function embedBookFont(doc: import('jspdf').jsPDF): Promise<boolean> {
  try {
    for (const face of await loadFaces()) {
      doc.addFileToVFS(face.file, face.base64);
      doc.addFont(face.file, PDF_FONT, face.style);
    }
    return true;
  } catch (err) {
    console.warn('[pdf] could not embed the book font, falling back to Times', err);
    return false;
  }
}
