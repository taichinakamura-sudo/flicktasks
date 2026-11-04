import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { Background } from "./components/Background";
import { Composer } from "./components/Composer";
import { DoneSummary } from "./components/DoneSummary";
import { Header } from "./components/Header";
import { NowCard } from "./components/NowCard";
import { PlanSummary } from "./components/PlanSummary";
import { Skeleton } from "./components/Skeleton";
import { StatusTabs } from "./components/StatusTabs";
import { TaskList } from "./components/TaskList";
import { TaskSheet } from "./components/TaskSheet";
import { Toast } from "./components/Toast";
import { useStore } from "./store";

export function App() {
  const booted = useStore((s) => s.booted);
  const boot = useStore((s) => s.boot);
  const showToast = useStore((s) => s.showToast);

  useEffect(() => {
    void boot();
    const err = new URLSearchParams(location.search).get("auth_error");
    if (err) {
      showToast("ログインできませんでした");
      history.replaceState(null, "", "/");
    }
  }, [boot, showToast]);

  return (
    <MotionConfig reducedMotion="user">
      <Background />
      <main
        className="mx-auto flex min-h-full w-full max-w-[560px] flex-col gap-4 px-4 safe-t"
        data-booted={booted}
      >
        <Header />
        <Composer />
        <StatusTabs />
        <NowCard />
        <PlanSummary />
        <DoneSummary />
        <TaskList />
      </main>
      <TaskSheet />
      <Toast />
      <Skeleton visible={!booted} />
    </MotionConfig>
  );
}
