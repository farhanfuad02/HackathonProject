import React from "react";

/**
 * Top-view office layout (bonus feature). Mirrors the floor plan from
 * the problem statement: Drawing Room | Work Room 1 | Work Room 2,
 * each with 2 ceiling fans and 3 lights, plus an entry corridor.
 *
 * Device state is reflected visually:
 *   - lights GLOW (warm radial gradient) when ON
 *   - fans SPIN (CSS rotation) when ON
 * Everything re-renders from the live snapshot, so the floor plan
 * animates in real time as the simulator flips devices.
 */

const ROOM_W = 300;
const ROOM_H = 260;
const GAP = 14;

/** Relative device anchor points inside a room (x, y in room coords). */
const LIGHT_SPOTS = [
  [60, 52],
  [240, 52],
  [150, 205],
];
const FAN_SPOTS = [
  [95, 130],
  [205, 130],
];

function Light({ x, y, on, name }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {on && <circle r="26" fill="url(#lightGlow)" />}
      <circle
        r="8"
        fill={on ? "#ffd76a" : "#2c2c2a"}
        stroke={on ? "#fab219" : "#52514e"}
        strokeWidth="1.5"
      />
      <title>{`${name} — ${on ? "ON" : "OFF"}`}</title>
    </g>
  );
}

function Fan({ x, y, on, name }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="20" fill="none" stroke="#383835" strokeWidth="1" />
      <g className={on ? "fan-spin" : ""}>
        {[0, 120, 240].map((angle) => (
          <ellipse
            key={angle}
            cx="0"
            cy="-11"
            rx="4.5"
            ry="11"
            fill={on ? "#6da7ec" : "#52514e"}
            transform={`rotate(${angle})`}
          />
        ))}
        <circle r="4" fill={on ? "#3987e5" : "#898781"} />
      </g>
      <title>{`${name} — ${on ? "ON" : "OFF"}`}</title>
    </g>
  );
}

/** Simple furniture so the plan reads as an office, not a diagram. */
function Furniture({ roomId }) {
  if (roomId === "drawing") {
    return (
      <g className="furniture">
        <rect x="24" y="95" width="26" height="80" rx="6" /> {/* sofa */}
        <rect x="120" y="115" width="60" height="34" rx="4" /> {/* table */}
        <rect x="250" y="100" width="26" height="26" rx="13" /> {/* chair */}
      </g>
    );
  }
  return (
    <g className="furniture">
      <rect x="30" y="85" width="52" height="26" rx="3" />
      <rect x="218" y="85" width="52" height="26" rx="3" />
      <rect x="30" y="160" width="52" height="26" rx="3" />
      <rect x="218" y="160" width="52" height="26" rx="3" />
    </g>
  );
}

export default function OfficeMap({ state }) {
  const { rooms, devices, power } = state;
  const width = rooms.length * ROOM_W + (rooms.length - 1) * GAP;
  const height = ROOM_H + 64; // room band + corridor

  return (
    <svg
      className="office-map"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Live office floor plan"
    >
      <defs>
        <radialGradient id="lightGlow">
          <stop offset="0%" stopColor="#ffd76a" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffd76a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {rooms.map((room, i) => {
        const ox = i * (ROOM_W + GAP);
        const roomDevices = devices.filter((d) => d.room === room.id);
        const lights = roomDevices.filter((d) => d.type === "light");
        const fans = roomDevices.filter((d) => d.type === "fan");
        return (
          <g key={room.id} transform={`translate(${ox} 0)`}>
            <rect
              className="room-rect"
              width={ROOM_W}
              height={ROOM_H}
              rx="10"
            />
            {/* door gap on the corridor side */}
            <rect
              x={ROOM_W / 2 - 22}
              y={ROOM_H - 3}
              width="44"
              height="6"
              fill="#0d0d0d"
            />
            <Furniture roomId={room.id} />
            <text className="room-name" x="16" y="28">
              {room.name.toUpperCase()}
            </text>
            <text className="room-watts" x="16" y={ROOM_H - 14}>
              {power.perRoom[room.id]} W
            </text>
            {lights.map((d, j) => (
              <Light
                key={d.id}
                x={LIGHT_SPOTS[j][0]}
                y={LIGHT_SPOTS[j][1]}
                on={d.status === "on"}
                name={d.name}
              />
            ))}
            {fans.map((d, j) => (
              <Fan
                key={d.id}
                x={FAN_SPOTS[j][0]}
                y={FAN_SPOTS[j][1]}
                on={d.status === "on"}
                name={d.name}
              />
            ))}
          </g>
        );
      })}

      {/* corridor + entry */}
      <rect
        className="room-rect corridor"
        y={ROOM_H + 8}
        width={width}
        height="40"
        rx="8"
      />
      <text className="room-name" x={width / 2} y={ROOM_H + 33} textAnchor="middle">
        ⬆ ENTRY
      </text>
    </svg>
  );
}
