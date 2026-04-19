"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

export default function CoinInfoPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { resolvedTheme } = useTheme();

  const postTheme = (theme: string | undefined) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "theme", theme: theme === "light" ? "light" : "dark" },
      "*"
    );
  };

  useEffect(() => {
    postTheme(resolvedTheme);
  }, [resolvedTheme]);

  return (
    <iframe
      ref={iframeRef}
      src="https://kimpver103.vercel.app"
      onLoad={() => postTheme(resolvedTheme)}
      style={{
        width: "100%",
        height: "calc(100vh - var(--topbar-h, 48px) - var(--bottomnav-h, 60px))",
        border: "none",
        display: "block",
      }}
    />
  );
}
