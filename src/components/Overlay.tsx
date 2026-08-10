import type { CSSProperties, ReactNode } from "react";

export function Overlay({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <main style={style} className="flex h-screen min-h-0 w-screen flex-col overflow-hidden rounded-[18px] border border-zinc-800/90 bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl">{children}</main>;
}
