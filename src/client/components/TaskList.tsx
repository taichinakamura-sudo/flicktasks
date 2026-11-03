import { AnimatePresence, motion, type Variants } from "motion/react";
import { useStore } from "../store";
import { TaskCard } from "./TaskCard";

const variants: Variants = {
  initial: { opacity: 0, y: -14, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: (dir: 1 | -1) => ({
    opacity: 0,
    x: dir * 480,
    scale: 0.9,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function TaskList() {
  const filter = useStore((s) => s.filter);
  const tasks = useStore((s) => s.tasks);
  const dir = useStore((s) => s.lastFlickDir);
  const visible = tasks.filter((t) => t.status === filter);

  return (
    <div className="relative flex flex-col gap-3 pb-28" data-testid="task-list">
      <AnimatePresence mode="popLayout" custom={dir} initial={false}>
        {visible.map((t) => (
          <motion.div
            key={t.id}
            layout
            custom={dir}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <TaskCard task={t} />
          </motion.div>
        ))}
      </AnimatePresence>
      {visible.length === 0 && (
        <motion.div
          key={`empty-${filter}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col items-center gap-2 pt-16 text-faint"
          data-testid="empty"
        >
          <span className="h-10 w-10 rounded-full border border-dashed border-faint/60" />
        </motion.div>
      )}
    </div>
  );
}
