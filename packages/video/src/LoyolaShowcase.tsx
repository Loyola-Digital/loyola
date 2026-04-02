import { AbsoluteFill, Sequence } from "remotion";
import { IntroScene } from "./scenes/IntroScene";
import { MindsScene } from "./scenes/MindsScene";
import { ChatScene } from "./scenes/ChatScene";
import { InstagramScene } from "./scenes/InstagramScene";
import { AdsScene } from "./scenes/AdsScene";
import { FunnelScene } from "./scenes/FunnelScene";
import { TasksScene } from "./scenes/TasksScene";
import { OutroScene } from "./scenes/OutroScene";
import { colors } from "./styles";

// 60fps, each scene duration in frames
const SCENE_DURATION = {
  intro: 360, // 6s
  minds: 420, // 7s
  chat: 420, // 7s
  instagram: 390, // 6.5s
  ads: 360, // 6s
  funnel: 330, // 5.5s
  tasks: 300, // 5s
  outro: 120, // 2s
};

export const LoyolaShowcase: React.FC = () => {
  let offset = 0;
  const seq = (duration: number) => {
    const from = offset;
    offset += duration;
    return from;
  };

  const introFrom = seq(SCENE_DURATION.intro);
  const mindsFrom = seq(SCENE_DURATION.minds);
  const chatFrom = seq(SCENE_DURATION.chat);
  const instagramFrom = seq(SCENE_DURATION.instagram);
  const adsFrom = seq(SCENE_DURATION.ads);
  const funnelFrom = seq(SCENE_DURATION.funnel);
  const tasksFrom = seq(SCENE_DURATION.tasks);
  const outroFrom = seq(SCENE_DURATION.outro);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <Sequence from={introFrom} durationInFrames={SCENE_DURATION.intro}>
        <IntroScene />
      </Sequence>

      <Sequence from={mindsFrom} durationInFrames={SCENE_DURATION.minds}>
        <MindsScene />
      </Sequence>

      <Sequence from={chatFrom} durationInFrames={SCENE_DURATION.chat}>
        <ChatScene />
      </Sequence>

      <Sequence from={instagramFrom} durationInFrames={SCENE_DURATION.instagram}>
        <InstagramScene />
      </Sequence>

      <Sequence from={adsFrom} durationInFrames={SCENE_DURATION.ads}>
        <AdsScene />
      </Sequence>

      <Sequence from={funnelFrom} durationInFrames={SCENE_DURATION.funnel}>
        <FunnelScene />
      </Sequence>

      <Sequence from={tasksFrom} durationInFrames={SCENE_DURATION.tasks}>
        <TasksScene />
      </Sequence>

      <Sequence from={outroFrom} durationInFrames={SCENE_DURATION.outro}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
