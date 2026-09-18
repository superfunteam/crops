import { Composition, Still } from "remotion";
import { Launch } from "./Launch";
import { SHARE, ShareAgents, SharePrice } from "./stills";
import { DURATION, FPS } from "./timeline";

export const Root = () => (
  <>
    <Composition
      id="CropsLaunch"
      component={Launch}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Still id="SharePrice" component={SharePrice} {...SHARE} />
    <Still id="ShareAgents" component={ShareAgents} {...SHARE} />
  </>
);
