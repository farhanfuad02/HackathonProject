import React from "react";

/**
 * Live power consumption meter:
 *   - sparkline of total office draw over the last ~15 minutes
 *   - per-room breakdown as direct-labeled horizontal bars
 *
 * One quantity, one axis, sequential blue for magnitude — values are
 * written next to each mark (never encoded by color alone).
 */

const SPARK_W = 460;
const SPARK_H = 90;

function Sparkline({ history }) {
  if (history.length < 2) return null;
  const watts = history.map((p) => p.watts);
  const max = Math.max(...watts, 1);
  const step = SPARK_W / (history.length - 1);
  const y = (w) => SPARK_H - (w / max) * (SPARK_H - 8);
  const line = watts.map((w, i) => `${i * step},${y(w)}`).join(" ");
  const area = `0,${SPARK_H} ${line} ${SPARK_W},${SPARK_H}`;
  const last = history[history.length - 1];

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      role="img"
      aria-label={`Total power trend, currently ${last.watts} watts`}
    >
      <polygon points={area} fill="#3987e5" opacity="0.15" />
      <polyline
        points={line}
        fill="none"
        stroke="#3987e5"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx={SPARK_W} cy={y(last.watts)} r="3.5" fill="#3987e5" />
    </svg>
  );
}

export default function PowerPanel({ state }) {
  const { rooms, power, history } = state;
  const maxRoom = Math.max(...rooms.map((r) => power.perRoom[r.id]), 1);

  return (
    <div className="power-panel">
      <div className="power-headline">
        <span className="power-now">{power.totalWatts} W</span>
        <span className="power-sub">
          total draw · {power.todayKwh.toFixed(2)} kWh today
        </span>
      </div>
      <Sparkline history={history} />

      <table className="room-bars" aria-label="Power per room">
        <tbody>
          {rooms.map((room) => {
            const watts = power.perRoom[room.id];
            const kwh = power.todayKwhPerRoom[room.id];
            return (
              <tr key={room.id}>
                <td className="bar-label">{room.name}</td>
                <td className="bar-cell">
                  <div
                    className="bar-fill"
                    style={{ width: `${(watts / maxRoom) * 100}%` }}
                  />
                </td>
                <td className="bar-value">
                  {watts} W <small>· {kwh.toFixed(2)} kWh</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
