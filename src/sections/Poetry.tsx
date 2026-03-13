import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const poems = [
  {
    title: "Scent of Salt",
    stanzas: [
      "Too deep —\nbarely breathing.\nCursed to swim,\nnot float.",
      "Current pulls —\nfurther,\ndeeper,\nThe shore whispers,\nhorizon taunts.",
      "Soon to sink.\nTo drown.",
      "I am a wick —\nforced to burn,\ndoomed to smother.",
      "Haunted by breath —\nthat clogs, not clears.",
      "Lungs will fill —\nwith smoke or salt.\nFull.",
      "Waves don't wait\nfor sand or stone.\nTreading's for survival —\nnot life.",
      "Arms, soon to give.\nLegs will quit.\nThe sea will take me.",
      "A body once known,\nturned depths lurking.\nThe salt will claim me.",
    ],
  },
  {
    title: "Routine in Green",
    stanzas: [
      "Click click —\nthe mint approaches.\nA simple feeling:\nan ache masked in flavor.",
      "Click click —\nthe tube running low,\na soft charade\nof bliss.",
      "The temptation of tongue,\nthe dread of the teeth.\nClick click —\nno twist left —\nwasting.",
      "As the lips cry their wear,\nthe thumb plays that rhythm.\nClick click —\nthe relief dwindles.",
      "Balm seals the creases —\na crack no more.\nAs the click click\ngrows distant.",
      "A cheap motion,\nin object, in cost.\nA purpose: routine —\na callous click click.",
      "For the green distracts,\nthe mint soothes the pain.\nClick click —\njust for me.",
    ],
  },
  {
    title: "Rings, Not Stories",
    stanzas: [
      "Still walking.\nTo what —\nto where?\nIt's unbecoming;\njust walking.",
      "The leaves rustle,\nthe humidity just so.\nThere —\na shadow scurries across the path.",
      "Just a rat —\na mouse maybe.\nHurriedly running from a faint flutter —\na whisper of wings —\na \"who\" echoes — alone.",
      "Pine muddles the senses.\nThe wind\nshouting from the valley afar.",
      "For the trees:\nthey're listening — laughing.",
      "But they do not speak,\nnor cast judgment.\nFor they cannot\nwith their lungs filled with sap.",
      "They cannot breathe alone,\nyet they persevere all the same.\nFor their yearning's not for novels —\nbut for rings.",
      "While the granite lies again exposed,\nand the moss now looks west.\nAnd the trees still chuckle,\nwith a new grin on the same grain.",
      "Now the branches feel like family,\nand all the timber gathers near.\nThe trees continue dancing —\nlike they always do.",
      "\"Have I seen that one before?\"",
    ],
  },
];

export default function Poetry() {
  const [active, setActive] = useState(0);

  return (
    <section
      id="poetry"
      className="relative min-h-screen flex items-center justify-center px-8 py-24"
    >
      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.span
            className="inline-block text-[11px] font-mono tracking-[0.2em] mb-4"
            style={{ color: "var(--accent-light)" }}
          >
            04
          </motion.span>
          <motion.h2
            transition={{ duration: 0.3 }}
            className="font-heading text-4xl md:text-5xl lg:text-6xl font-normal"
            style={{ color: "var(--fg)" }}
          >
            Poetry
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="h-[2px] w-12 mx-auto mt-6 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-light))" }}
          />
          <motion.p
            transition={{ duration: 0.3, delay: 0.15 }}
            className="mt-6 text-base md:text-lg max-w-md mx-auto"
            style={{ color: "var(--fg-secondary)" }}
          >
            Different discipline, same honesty requirement.
          </motion.p>
        </div>

        {/* Poem tabs */}
        <div className="flex justify-center gap-2 mb-14 flex-wrap">
          {poems.map((poem, i) => (
            <button
              key={poem.title}
              onClick={() => setActive(i)}
              className="relative px-5 py-2.5 rounded-xl text-sm font-mono tracking-wide transition-all duration-300 cursor-pointer"
              style={{
                background: active === i ? "var(--accent-glow)" : "transparent",
                border: `1px solid ${active === i ? "var(--border-accent)" : "var(--border)"}`,
                color: active === i ? "var(--fg)" : "var(--fg-muted)",
              }}
            >
              {poem.title}
              {active === i && (
                <motion.div
                  layoutId="poem-tab"
                  className="absolute -bottom-px left-4 right-4 h-0.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Poem content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="max-w-lg mx-auto text-center"
          >
            <motion.h3
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="font-serif text-2xl md:text-3xl italic mb-12"
              style={{ color: "var(--fg)" }}
            >
              {poems[active].title}
            </motion.h3>

            <div className="space-y-8">
              {poems[active].stanzas.map((stanza, i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.12 + i * 0.04 }}
                >
                  {stanza.split("\n").map((line, j) => (
                    <p
                      key={j}
                      className="font-serif text-base md:text-lg leading-[2]"
                      style={{ color: "var(--fg-secondary)" }}
                    >
                      {line}
                    </p>
                  ))}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
