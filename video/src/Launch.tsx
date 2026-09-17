import { AbsoluteFill, Html5Audio, staticFile } from "remotion";
import "./fonts";
import { Agents, Answer, Apps, Billing, Free, Harvest, Intro, Outro, Reports, Teams, Timer, Title } from "./scenes";
import { SCENES } from "./timeline";
import { Background, Flash } from "./ui";

export function Launch() {
  return (
    <AbsoluteFill>
      <Html5Audio src={staticFile("soundtrack.mp3")} />
      <Background />
      <Intro />
      <Answer />
      <Title />
      <Timer />
      <Teams />
      <Billing />
      <Apps />
      <Reports />
      <Harvest />
      <Free />
      <Agents />
      <Outro />
      <Flash at={4} />
      <Flash at={SCENES.harvest[0]} />
      <Flash at={SCENES.agents[0]} />
    </AbsoluteFill>
  );
}
