import type { ReactNode } from "react";

interface Props {
  num: string;
  title: string;
  intent: string;
  slot: string;
  effort: "low" | "medium" | "high";
  children: ReactNode;
}

const effortColor = {
  low: "#5CB8B8",
  medium: "#D4944A",
  high: "#C97B5E",
};

export default function GallerySection({ num, title, intent, slot, effort, children }: Props) {
  return (
    <section className="relative py-20 px-8 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-baseline gap-4 mb-3 flex-wrap">
            <span className="font-mono text-xs tracking-[0.25em]" style={{ color: "var(--accent-light)" }}>
              {num}
            </span>
            <h2 className="font-heading text-3xl md:text-4xl" style={{ color: "var(--fg)" }}>
              {title}
            </h2>
            <span
              className="text-[10px] font-mono uppercase tracking-[0.2em] px-2.5 py-1 rounded-md"
              style={{
                background: `${effortColor[effort]}15`,
                border: `1px solid ${effortColor[effort]}30`,
                color: effortColor[effort],
              }}
            >
              {effort} effort
            </span>
          </div>
          <p className="text-[15px] leading-[1.75] max-w-3xl mb-2" style={{ color: "var(--fg-secondary)" }}>
            {intent}
          </p>
          <p className="text-xs font-mono" style={{ color: "var(--fg-muted)" }}>
            <span style={{ color: "var(--accent-light)" }}>▸</span> would replace / augment: <span style={{ color: "var(--fg-secondary)" }}>{slot}</span>
          </p>
        </div>

        {/* Prototype */}
        <div className="relative">
          <div
            className="absolute -inset-4 rounded-2xl pointer-events-none"
            style={{
              background: "linear-gradient(135deg, rgba(74,154,154,0.03), transparent 60%)",
              border: "1px dashed rgba(74,154,154,0.12)",
            }}
          />
          <div className="relative">{children}</div>
        </div>
      </div>
    </section>
  );
}
