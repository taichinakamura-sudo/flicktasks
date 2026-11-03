import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { GoogleIcon, LogoutIcon } from "./Icons";

export function Header() {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <header className="flex items-center justify-between pt-2">
      <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink/80">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#8db5ff] to-[#f3a4d6]" />
        flicktasks
      </div>
      <div ref={ref} className="relative">
        {user ? (
          <motion.button
            type="button"
            aria-label="アカウント"
            data-testid="avatar"
            whileTap={{ scale: 0.92 }}
            onClick={() => setOpen((v) => !v)}
            className="glass flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold"
          >
            {user.picture ? (
              <img
                src={user.picture}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              (user.name ?? user.email).slice(0, 1).toUpperCase()
            )}
          </motion.button>
        ) : (
          <motion.a
            href="/auth/google"
            aria-label="Googleでログイン"
            data-testid="login"
            whileTap={{ scale: 0.92 }}
            className="glass flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium"
          >
            <GoogleIcon />
            <span>ログイン</span>
          </motion.a>
        )}
        <AnimatePresence>
          {open && user && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
              className="glass glass-strong absolute right-0 z-30 mt-2 w-56 origin-top-right rounded-2xl p-2"
            >
              <div className="px-3 py-2">
                <div className="truncate text-[14px] font-medium" data-testid="user-name">
                  {user.name ?? user.email}
                </div>
                <div className="truncate text-[12px] text-mute">{user.email}</div>
              </div>
              <button
                type="button"
                data-testid="logout"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[14px] hover:bg-black/5 active:bg-black/10"
              >
                <LogoutIcon width={16} height={16} />
                ログアウト
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
