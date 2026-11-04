import { useEffect, useState } from "react";

/** enabled の間、1秒ごとに現在時刻(epoch ms)で再レンダーする。経過時間のライブ表示用 */
export function useTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
