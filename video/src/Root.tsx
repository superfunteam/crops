import { Composition } from "remotion";
import { Launch } from "./Launch";
import { DURATION, FPS } from "./timeline";

export const Root = () => (
  <Composition
    id="CropsLaunch"
    component={Launch}
    durationInFrames={DURATION}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
