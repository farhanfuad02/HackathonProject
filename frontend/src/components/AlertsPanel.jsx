import React from "react";

const TYPE_META = {
  "after-hours": { icon: "🌙", label: "After hours" },
  "long-running": { icon: "⏱️", label: "Running 2h+" },
};

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Active Alerts panel. Active alerts lead; the few most recently
 * resolved ones stay visible (dimmed) so the boss can see the system
 * noticing and clearing conditions. Every alert is timestamped and
 * carries an icon + label — never color alone.
 */
export default function AlertsPanel({ alerts }) {
  const active = alerts.filter((a) => a.active);
  const resolved = alerts.filter((a) => !a.active).slice(0, 3);

  if (active.length === 0 && resolved.length === 0) {
    return <p className="all-clear">✅ All clear — nothing anomalous right now.</p>;
  }

  return (
    <ul className="alert-list">
      {active.map((a) => {
        const meta = TYPE_META[a.type] ?? { icon: "⚠️", label: a.type };
        return (
          <li key={a.id} className="alert alert-active">
            <span className="alert-icon">{meta.icon}</span>
            <div>
              <span className="alert-tag">{meta.label}</span>
              <p>{a.message}</p>
              <time>since {timeOf(a.createdAt)}</time>
            </div>
          </li>
        );
      })}
      {resolved.map((a) => (
        <li key={a.id} className="alert alert-resolved">
          <span className="alert-icon">✔</span>
          <div>
            <p>{a.message}</p>
            <time>
              {timeOf(a.createdAt)} → resolved {timeOf(a.resolvedAt)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}
