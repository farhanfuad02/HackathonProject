/**
 * useLiveState - single subscription point for the whole dashboard.
 *
 * Two data sources, same snapshot shape:
 *
 *   1. Live (default): connects to the backend's Socket.IO feed and
 *      keeps the latest full state snapshot in React state. Every
 *      simulator tick pushes a new snapshot, so the UI updates in real
 *      time with no page refresh and no polling. Falls back to a
 *      one-off REST fetch for the very first paint if the socket is
 *      slow to connect.
 *
 *   2. Demo (VITE_DEMO=true at build time): runs the simulator in the
 *      browser instead - used for the static GitHub Pages deploy,
 *      where no backend exists.
 */

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { startDemoSim } from "../demo/demoSim.js";

const DEMO = import.meta.env.VITE_DEMO === "true";

export function useLiveState() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(DEMO);

  useEffect(() => {
    if (DEMO) {
      return startDemoSim(setState);
    }

    // Same-origin: the Vite dev server proxies /socket.io to :4000.
    const socket = io();

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (snapshot) => setState(snapshot));

    // First-paint fallback while the websocket handshakes.
    fetch("/api/snapshot")
      .then((r) => (r.ok ? r.json() : null))
      .then((snap) => snap && setState((prev) => prev ?? snap))
      .catch(() => {});

    return () => socket.disconnect();
  }, []);

  return { state, connected, demo: DEMO };
}
