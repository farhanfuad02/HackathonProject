/**
 * useLiveState - single subscription point for the whole dashboard.
 *
 * Connects to the backend's Socket.IO feed and keeps the latest full
 * state snapshot in React state. Every simulator tick pushes a new
 * snapshot, so the UI updates in real time with no page refresh and
 * no polling. Falls back to a one-off REST fetch for the very first
 * paint if the socket is slow to connect.
 */

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export function useLiveState() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
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

  return { state, connected };
}
