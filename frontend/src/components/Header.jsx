import React from "react";

export default function Header({ time, connected }) {
  const clock = new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <header className="header">
      <div>
        <h1>💡 Office Electricity Monitor</h1>
        <p className="subtitle">
          3 rooms · 6 fans · 9 lights — one live view of everything
        </p>
      </div>
      <div className="header-right">
        <span className={`conn ${connected ? "conn-on" : "conn-off"}`}>
          <span className="conn-dot" />
          {connected ? "Live" : "Reconnecting…"}
        </span>
        <span className="clock">{clock}</span>
      </div>
    </header>
  );
}
