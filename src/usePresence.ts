import { useEffect, useState } from "react";

export function motionMs(kind: "enter" | "exit") {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return 80;
  }
  return kind === "enter" ? 280 : 200;
}

/** Keep a node mounted through its exit animation. */
export function usePresence(open: boolean) {
  const [state, setState] = useState({ present: open, leaving: false });

  useEffect(() => {
    if (open) {
      setState({ present: true, leaving: false });
      return;
    }
    setState((current) =>
      current.present ? { present: true, leaving: true } : current,
    );
  }, [open]);

  useEffect(() => {
    if (!state.leaving || open) return;
    const timer = window.setTimeout(() => {
      setState({ present: false, leaving: false });
    }, motionMs("exit"));
    return () => clearTimeout(timer);
  }, [state.leaving, open]);

  return {
    present: state.present || open,
    leaving: state.leaving && !open,
  };
}
