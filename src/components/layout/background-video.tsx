"use client";

import { useCallback, useEffect, useRef } from "react";

export function BackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const ensurePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    void video.play().catch(() => {
      // A later pointer interaction or visibility change retries playback.
    });
  }, []);

  useEffect(() => {
    ensurePlayback();
    const resume = () => {
      if (document.visibilityState === "visible") ensurePlayback();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pointerdown", ensurePlayback, { once: true });
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pointerdown", ensurePlayback);
    };
  }, [ensurePlayback]);

  return (
    <video
      ref={videoRef}
      className="bg-video"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      onCanPlay={ensurePlayback}
    >
      <source src="/rain.mp4" type="video/mp4" />
    </video>
  );
}
