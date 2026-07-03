import React from "react";
import { useLiveState } from "./hooks/useLiveState.js";
import Header from "./components/Header.jsx";
import StatTiles from "./components/StatTiles.jsx";
import OfficeMap from "./components/OfficeMap.jsx";
import RoomPanel from "./components/RoomPanel.jsx";
import PowerPanel from "./components/PowerPanel.jsx";
import AlertsPanel from "./components/AlertsPanel.jsx";

export default function App() {
  const { state, connected, demo } = useLiveState();

  if (!state) {
    return (
      <div className="loading">
        <div className="loading-pulse" />
        Connecting to the office…
      </div>
    );
  }

  return (
    <div className="app">
      <Header time={state.time} connected={connected} demo={demo} />
      <StatTiles state={state} />

      <section className="panel map-panel">
        <h2>Office layout — live</h2>
        <OfficeMap state={state} />
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Power consumption</h2>
          <PowerPanel state={state} />
        </section>
        <section className="panel">
          <h2>Active alerts</h2>
          <AlertsPanel alerts={state.alerts} />
        </section>
      </div>

      <section className="panel">
        <h2>Device status by room</h2>
        <RoomPanel state={state} />
      </section>

      <footer className="footer">
        Office Electricity Monitor · simulated device layer ·{" "}
        {demo
          ? "static demo build — simulator runs in your browser"
          : "data refreshes live over Socket.IO"}
      </footer>
    </div>
  );
}
