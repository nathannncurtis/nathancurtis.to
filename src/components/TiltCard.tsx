import { useRef, useCallback } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  intensity?: number;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export default function TiltCard({ children, className, style, intensity = 6, onMouseEnter, onMouseLeave: onMLProp }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(800px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg)`;
    },
    [intensity]
  );

  const onMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (el) el.style.transform = "perspective(800px) rotateY(0deg) rotateX(0deg)";
      onMLProp?.(e);
    },
    [onMLProp]
  );

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, transition: "transform 0.2s ease-out, border-color 0.3s, box-shadow 0.3s" }}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
