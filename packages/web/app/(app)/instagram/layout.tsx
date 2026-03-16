import type { ReactNode } from "react";

export default function InstagramLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 p-4 md:p-6">{children}</div>;
}
