import { Composition } from "remotion";
import { LoyolaShowcase } from "./LoyolaShowcase";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LoyolaShowcase"
      component={LoyolaShowcase}
      durationInFrames={60 * 45} // 45 seconds at 60fps
      fps={60}
      width={1920}
      height={1080}
    />
  );
};
