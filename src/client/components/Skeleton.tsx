import { AnimatePresence, motion } from "motion/react";

const Block = ({ className, h }: { className: string; h?: number }) => (
  <div className={`skel ${className}`} style={h ? { height: h } : undefined} />
);

const SKELETON_ROWS = [
  { id: "a", h: 92 },
  { id: "b", h: 72 },
  { id: "c", h: 110 },
  { id: "d", h: 80 },
  { id: "e", h: 96 },
];

export function Skeleton({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="skeleton"
          data-testid="skeleton"
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40"
          style={{ background: "var(--bg)" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.015, filter: "blur(6px)" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mx-auto flex h-full w-full max-w-[560px] flex-col gap-4 px-4 safe-t">
            <div className="flex items-center justify-between pt-2">
              <Block className="h-7 w-24 rounded-xl" />
              <Block className="h-9 w-9 rounded-full" />
            </div>
            <Block className="rounded-[22px]" h={64} />
            <Block className="h-11 rounded-full" />
            <div className="flex flex-col gap-3 pt-1">
              {SKELETON_ROWS.map((r) => (
                <Block key={r.id} className="rounded-[22px]" h={r.h} />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
