/**
 * Converts the Latin subsets of Literata from WOFF2 to TTF, for embedding in the PDF.
 *
 * jsPDF can only parse TTF, and Fontsource ships WOFF2 only. WOFF2 is a compressed
 * sfnt, so decompressing recovers a normal TTF. The Latin subsets are used rather than
 * the full faces: they carry everything the app writes and are a fraction of the size.
 *
 * Run with `npm run fonts`. The output is checked in, so a normal build needs no
 * font tooling.
 */
import { readFile, writeFile } from 'node:fs/promises';
import woff2 from 'wawoff2';

const FACES = [
  ['literata-latin-400-normal.woff2', 'literata-regular.ttf'],
  ['literata-latin-700-normal.woff2', 'literata-bold.ttf'],
  ['literata-latin-400-italic.woff2', 'literata-italic.ttf'],
];

for (const [src, out] of FACES) {
  const input = await readFile(`node_modules/@fontsource/literata/files/${src}`);
  const ttf = await woff2.decompress(input);
  await writeFile(`src/pdf/fonts/${out}`, ttf);
  console.log(`${src} -> ${out}  ${(ttf.length / 1024).toFixed(0)} KB`);
}
