import React from "react";

function sinceLabel(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

/**
 * Live Device Status Panel — all 15 devices grouped by room, each with
 * a clear name, an ON/OFF chip (icon + word, not color alone) and its
 * last state-change time. Clicking a device toggles it via the API,
 * which demonstrates the realtime round-trip during demos.
 */
export default function RoomPanel({ state }) {
  const { rooms, devices } = state;

  const toggle = (id) => {
    fetch(`/api/devices/${id}/toggle`, { method: "POST" }).catch(() => {});
  };

  return (
    <div className="rooms-grid">
      {rooms.map((room) => {
        const roomDevices = devices.filter((d) => d.room === room.id);
        return (
          <div key={room.id} className="room-card">
            <h3>{room.name}</h3>
            <ul className="device-list">
              {roomDevices.map((d) => {
                const on = d.status === "on";
                return (
                  <li key={d.id}>
                    <button
                      className="device-row"
                      onClick={() => toggle(d.id)}
                      title="Click to toggle (manual override)"
                    >
                      <span className="device-icon">
                        {d.type === "fan" ? "🌀" : "💡"}
                      </span>
                      <span className="device-name">{d.name}</span>
                      <span className="device-meta">
                        {on ? `${d.watts} W` : sinceLabel(d.lastChanged)}
                      </span>
                      <span className={`chip ${on ? "chip-on" : "chip-off"}`}>
                        {on ? "● ON" : "○ OFF"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
