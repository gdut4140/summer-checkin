"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { gsap } from "gsap";

import "@/styles/bg-accordion.css";

export interface BgGalleryItem {
  image: string;
  label?: string;
  value: string;
  alt?: string;
}

interface BgAccordionGalleryProps {
  items: BgGalleryItem[];
  activeIndex: number;
  onSelect?: (index: number, item: BgGalleryItem) => void;
  accentColor?: string;
  overlayColor?: string;
  textColor?: string;
  grayscale?: boolean;
  duration?: number;
  ease?: string;
  parallax?: number;
  tilt?: number;
  stagger?: number;
  trigger?: "hover" | "click";
  gap?: number;
  radius?: number;
  expandRatio?: number;
}

const BgAccordionGallery = ({
  items,
  activeIndex,
  onSelect,
  accentColor = "#ffffff",
  overlayColor = "#060010",
  textColor = "#ffffff",
  duration = 0.6,
  ease = "power3.out",
  parallax = 0.5,
  tilt = 4,
  stagger = 0.06,
  trigger = "hover",
  gap = 0,
  radius = 0,
  expandRatio = 0.5,
  grayscale = true,
}: BgAccordionGalleryProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mediaRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const textRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const firstRunRef = useRef(true);
  const mediaSizeRef = useRef(1200);

  const count = items.length;
  const [hoverActive, setHoverActive] = useState<number | null>(null);
  const active = hoverActive !== null ? hoverActive : activeIndex;

  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const applyLayout = useCallback(
    (animate: boolean) => {
      const panels = panelRefs.current;
      if (!panels.length) return;

      const r = Math.min(Math.max(expandRatio, 0.2), 0.95);
      const grow = count > 1 ? (r * (count - 1)) / (1 - r) : 1;
      const mediaSize = mediaSizeRef.current;

      tlRef.current?.kill();
      const dur = animate && !prefersReduced ? duration : 0;
      const tl = gsap.timeline();

      panels.forEach((panel, i) => {
        if (!panel) return;
        const isActive = i === active;
        const media = mediaRefs.current[i];
        const bar = barRefs.current[i];
        const text = textRefs.current[i];

        const rot = isActive ? 0 : i < active ? tilt : -tilt;

        tl.to(
          panel,
          { flexGrow: isActive ? grow : 1, rotateY: rot, duration: dur, ease },
          0
        );

        if (media) {
          const drift = Math.max(-1.5, Math.min(1.5, active - i));
          const shift = drift * parallax * mediaSize * 0.05;
          const gray = grayscale ? (isActive ? 0 : 1) : 0;
          tl.to(
            media,
            {
              xPercent: -50,
              yPercent: -50,
              x: isActive ? 0 : shift,
              "--ag-gray": gray,
              "--ag-dim": isActive ? 0 : 0.45,
              duration: dur,
              ease,
            },
            0
          );
        }

        if (bar && text) {
          if (isActive) {
            tl.to(
              [bar, text],
              { opacity: 1, x: 0, duration: dur, ease, stagger: prefersReduced ? 0 : stagger },
              0
            );
          } else {
            tl.to([bar, text], { opacity: 0, x: -18, duration: dur * 0.55, ease }, 0);
          }
        }
      });

      tlRef.current = tl;
    },
    [active, count, expandRatio, duration, ease, tilt, parallax, grayscale, stagger, prefersReduced]
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const total = rect.width;
      const usable = Math.max(total - gap * (count - 1), 300);
      const size = Math.max(600, usable * Math.min(Math.max(expandRatio, 0.2), 0.95) * 1.15);
      mediaSizeRef.current = size;
      el.style.setProperty("--ag-media-size", `${size}px`);
      applyLayout(!firstRunRef.current);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [applyLayout, gap, count, expandRatio]);

  useEffect(() => {
    applyLayout(!firstRunRef.current);
    firstRunRef.current = false;
  }, [applyLayout]);

  useEffect(
    () => () => {
      tlRef.current?.kill();
    },
    []
  );

  const handleEnter = (i: number) => {
    if (trigger === "hover") setHoverActive(i);
  };

  const handleLeave = () => {
    setHoverActive(null);
  };

  const handleClick = (i: number) => {
    onSelect?.(i, items[i]);
  };

  return (
    <div
      ref={rootRef}
      className="bg-accordion"
      style={{
        "--ag-accent": accentColor,
        "--ag-overlay": overlayColor,
        "--ag-text": textColor,
        "--ag-gap": `${gap}px`,
        "--ag-radius": `${radius}px`,
      } as React.CSSProperties}
      role="list"
      aria-label="背景切换"
      onMouseLeave={handleLeave}
    >
      {items.map((item, i) => {
        const isActive = i === active;
        return (
          <button
            key={i}
            ref={(el) => { panelRefs.current[i] = el; }}
            className={`bg-ag-panel${isActive ? " bg-ag-panel--active" : ""}`}
            style={{ borderRadius: `${radius}px` }}
            onClick={() => handleClick(i)}
            onMouseEnter={() => handleEnter(i)}
            onFocus={() => handleEnter(i)}
            role="listitem"
            tabIndex={0}
            aria-current={isActive ? "true" : undefined}
            aria-label={item.label}
            type="button"
          >
            <span className="bg-ag-panel__frame">
              <span
                className="bg-ag-panel__media"
                ref={(el) => { mediaRefs.current[i] = el; }}
              >
                <img src={item.image} alt={item.alt || item.label || ""} draggable="false" />
              </span>
              <span className="bg-ag-panel__overlay" aria-hidden="true" />
            </span>
            <span className="bg-ag-panel__label" aria-hidden="true">
              <span className="bg-ag-panel__bar" ref={(el) => { barRefs.current[i] = el; }} />
              <span className="bg-ag-panel__text" ref={(el) => { textRefs.current[i] = el; }}>
                {item.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default BgAccordionGallery;
