import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

// Google Sans Flex and Google Sans Code (variable weight), bundled from Google Fonts.
export const FONT = '"Google Sans Flex", system-ui, sans-serif';
export const MONO = '"Google Sans Code", ui-monospace, Menlo, monospace';

const handle = delayRender("Loading Google Sans fonts");
Promise.all(
  [
    ["Google Sans Flex", "fonts/GoogleSansFlex-latin.woff2"],
    ["Google Sans Code", "fonts/GoogleSansCode-latin.woff2"],
  ].map(([family, file]) => {
    const face = new FontFace(family, `url(${staticFile(file)}) format("woff2")`, { weight: "1 1000" });
    return face.load().then(() => (document.fonts as unknown as { add: (f: FontFace) => void }).add(face));
  }),
)
  .then(() => continueRender(handle))
  .catch((err) => cancelRender(err));
