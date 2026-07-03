import React from "react";

/**
 * Four headline numbers the boss cares about, rendered as stat tiles.
 * A single figure beats a chart for "how much power are we burning?".
 */
export default function StatTiles({ state }) {
  const { devices, power, alerts } = state;
  const onCount = devices.filter((d) => d.status === "on").length;
  const activeAlerts = alerts.filter((a) => a.active).length;

  const tiles = [
    {
      label: "Total power right now",
      value: power.totalWatts,
      unit: "W",
      tone: "accent",
    },
    {
      label: "Today's estimated usage",
      value: power.todayKwh.toFixed(2),
      unit: "kWh",
    },
    {
      label: "Devices on",
      value: onCount,
      unit: `/ ${devices.length}`,
    },
    {
      label: "Active alerts",
      value: activeAlerts,
      unit: activeAlerts === 1 ? "alert" : "alerts",
      tone: activeAlerts > 0 ? "warn" : "ok",
    },
  ];

  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div key={t.label} className={`tile tile-${t.tone || "plain"}`}>
          <span className="tile-label">{t.label}</span>
          <span className="tile-value">
            {t.value} <small>{t.unit}</small>
          </span>
        </div>
      ))}
    </div>
  );
}
