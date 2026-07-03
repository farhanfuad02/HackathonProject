/**
 * Alert engine - inspects the live device state after every simulator
 * tick and raises/resolves timestamped alerts for anomalous situations.
 *
 * Rules implemented (from the problem statement):
 *   1. AFTER-HOURS  - devices left ON outside office hours (9 AM-5 PM).
 *                     Aggregated per room so the panel stays readable.
 *   2. LONG-RUNNING - a room where ALL devices have been ON for more
 *                     than 2 hours continuously.
 *
 * Alerts are de-duplicated by `key` inside the store and automatically
 * resolved once the condition clears, so the Active Alerts panel always
 * reflects reality.
 */

import { store, ROOMS, OFFICE_HOURS } from "../state/store.js";

const TWO_HOURS_MS = 2 * 3_600_000;

function isAfterHours(date = new Date()) {
  const h = date.getHours();
  return h < OFFICE_HOURS.start || h >= OFFICE_HOURS.end;
}

/** "2 fans and 3 lights" style phrase for alert messages. */
function describeOnDevices(devices) {
  const fans = devices.filter((d) => d.type === "fan").length;
  const lights = devices.filter((d) => d.type === "light").length;
  const parts = [];
  if (fans) parts.push(`${fans} fan${fans > 1 ? "s" : ""}`);
  if (lights) parts.push(`${lights} light${lights > 1 ? "s" : ""}`);
  return parts.join(" and ");
}

/** Run all rules once. Called by the simulator on every tick. */
export function evaluateAlerts() {
  const now = new Date();
  const afterHours = isAfterHours(now);

  for (const room of ROOMS) {
    const devices = store.devicesInRoom(room.id);
    const onDevices = devices.filter((d) => d.status === "on");

    /* Rule 1 - devices left on after office hours */
    const afterHoursKey = `afterhours:${room.id}`;
    if (afterHours && onDevices.length > 0) {
      store.raiseAlert({
        key: afterHoursKey,
        type: "after-hours",
        room: room.id,
        message: `${room.name} still has ${describeOnDevices(
          onDevices
        )} ON outside office hours (${OFFICE_HOURS.start}:00-${OFFICE_HOURS.end}:00).`,
      });
    } else {
      store.resolveAlerts(afterHoursKey);
    }

    /* Rule 2 - whole room running continuously for over 2 hours */
    const longRunKey = `longrun:${room.id}`;
    const allOnLong =
      onDevices.length === devices.length &&
      devices.every(
        (d) => d.onSince && now - new Date(d.onSince) > TWO_HOURS_MS
      );
    if (allOnLong) {
      store.raiseAlert({
        key: longRunKey,
        type: "long-running",
        room: room.id,
        message: `Every device in ${room.name} has been ON for more than 2 hours straight - is anyone actually there?`,
      });
    } else {
      store.resolveAlerts(longRunKey);
    }
  }
}
