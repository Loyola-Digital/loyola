import React from "react";
import { useCurrentFrame } from "remotion";

interface TypeWriterProps {
  text: string;
  speed?: number; // frames per character
  delay?: number;
  style?: React.CSSProperties;
}

export const TypeWriter: React.FC<TypeWriterProps> = ({
  text,
  speed = 2,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - delay);
  const chars = Math.min(Math.floor(elapsed / speed), text.length);
  const visible = text.slice(0, chars);
  const showCursor = elapsed > 0 && chars < text.length;

  return (
    <span style={style}>
      {visible}
      {showCursor && (
        <span style={{ opacity: Math.floor(elapsed / 20) % 2 === 0 ? 1 : 0 }}>▎</span>
      )}
    </span>
  );
};
