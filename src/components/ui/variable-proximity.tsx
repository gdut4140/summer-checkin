import { forwardRef, useMemo, useRef, useEffect } from "react";
import { motion } from "motion/react";
import "./variable-proximity.css";

function useAnimationFrame(callback: () => void) {
  useEffect(() => {
    let frameId: number;
    const loop = () => { callback(); frameId = requestAnimationFrame(loop); };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [callback]);
}

function useMousePositionRef(containerRef: React.RefObject<HTMLElement | null>) {
  const positionRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const updatePosition = (x: number, y: number) => {
      if (containerRef?.current) {
        const rect = containerRef.current.getBoundingClientRect();
        positionRef.current = { x: x - rect.left, y: y - rect.top };
      } else { positionRef.current = { x, y }; }
    };
    const handleMouseMove = (ev: MouseEvent) => updatePosition(ev.clientX, ev.clientY);
    const handleTouchMove = (ev: TouchEvent) => { const t = ev.touches[0]; updatePosition(t.clientX, t.clientY); };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [containerRef]);
  return positionRef;
}

interface Props {
  label: string;
  fromFontVariationSettings: string;
  toFontVariationSettings: string;
  containerRef: React.RefObject<HTMLElement | null>;
  radius?: number;
  falloff?: "linear" | "exponential" | "gaussian";
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  highlightColor?: string;
  baseColor?: string;
}

const VariableProximity = forwardRef<HTMLSpanElement, Props>((props, ref) => {
  const {
    label, fromFontVariationSettings, toFontVariationSettings,
    containerRef, radius = 50, falloff = "linear",
    className = "", onClick, style, highlightColor, baseColor, ...rest
  } = props;

  const letterRefs = useRef<(HTMLElement | null)[]>([]);
  const interpolatedSettingsRef = useRef<string[]>([]);
  const mousePositionRef = useMousePositionRef(containerRef);
  const lastPosRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  const parsedSettings = useMemo(() => {
    const parseS = (s: string) =>
      new Map(s.split(",").map(p => p.trim().split(" ")).map(([n, v]) => [n.replace(/['"]/g, ""), parseFloat(v)]));
    const f = parseS(fromFontVariationSettings);
    const t = parseS(toFontVariationSettings);
    return Array.from(f.entries()).map(([axis, fv]) => ({ axis, fv, tv: t.get(axis) ?? fv }));
  }, [fromFontVariationSettings, toFontVariationSettings]);

  const dist = (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

  const falloffFn = (d: number) => {
    const n = Math.min(Math.max(1 - d / radius, 0), 1);
    if (falloff === "exponential") return n ** 2;
    if (falloff === "gaussian") return Math.exp(-((d / (radius / 2)) ** 2) / 2);
    return n;
  };

  useAnimationFrame(() => {
    if (!containerRef?.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const { x, y } = mousePositionRef.current;
    if (lastPosRef.current.x === x && lastPosRef.current.y === y) return;
    lastPosRef.current = { x, y };

    letterRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const lx = rect.left + rect.width / 2 - r.left;
      const ly = rect.top + rect.height / 2 - r.top;
      const d = dist(mousePositionRef.current.x, mousePositionRef.current.y, lx, ly);

      if (d >= radius) {
        el.style.fontVariationSettings = fromFontVariationSettings;
        if (baseColor) el.style.color = baseColor;
        return;
      }
      const fv = falloffFn(d);
      const ns = parsedSettings.map(({ axis, fv: fv2, tv }) =>
        `'${axis}' ${fv2 + (tv - fv2) * fv}`
      ).join(", ");
      interpolatedSettingsRef.current[i] = ns;
      el.style.fontVariationSettings = ns;
      if (highlightColor && baseColor) {
        el.style.color = highlightColor;
        el.style.opacity = `${0.5 + fv * 0.5}`;
      }
    });
  });

  const words = label.split(" ");
  let idx = 0;
  return (
    <span ref={ref} className={`${className} variable-proximity`} onClick={onClick}
      style={{ display: "inline", ...style }} {...rest}>
      {words.map((w, wi) => (
        <span key={wi} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
          {w.split("").map(ch => {
            const ci = idx++;
            return (
              <motion.span key={ci}
                ref={(el) => { letterRefs.current[ci] = el; }}
                style={{
                  display: "inline-block",
                  fontVariationSettings: interpolatedSettingsRef.current[ci],
                  color: baseColor,
                  transition: "color 0.15s ease-out, opacity 0.15s ease-out",
                }}
                aria-hidden="true">{ch}</motion.span>
            );
          })}
          {wi < words.length - 1 && <span style={{ display: "inline-block" }}>&nbsp;</span>}
        </span>
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
});

VariableProximity.displayName = "VariableProximity";
export default VariableProximity;
