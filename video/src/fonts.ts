import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

// Google Sans Flex (variable weight + optical size), bundled from Google Fonts.
export const FONT = '"Google Sans Flex", system-ui, sans-serif';

const handle = delayRender("Loading Google Sans Flex");
const face = new FontFace(
  "Google Sans Flex",
  `url(${staticFile("fonts/GoogleSansFlex-latin.woff2")}) format("woff2")`,
  { weight: "1 1000" },
);
face
  .load()
  .then(() => {
    (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
    continueRender(handle);
  })
  .catch((err) => cancelRender(err));
