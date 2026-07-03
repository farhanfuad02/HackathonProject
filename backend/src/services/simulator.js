/**
 * Device simulator - the "Simulated Device Layer" of the architecture.
 *
 * Generates and continuously mutates the state of all 15 devices
 * (3 rooms x [2 fans + 3 lights]) so the dashboard and Discord bot
 * always have live data to show.
 *
 * The simulation is occupancy-aware rather than pure random noise:
 *   - During office hours (9-17) work rooms are busy, so devices are
 *     likely ON and toggle occasionally as people move around.
 *   - The drawing room is a waiting area - lower occupancy, sparser use.
 *   - After hours most devices drift OFF, but with a small chance of
 *     being "forgotten" ON - which is exactly what feeds the alert
 *     rules and makes the demo interesting.
 */

import { store, ROOMS, OFFICE_HOURS } from "../state/store.js";
import { evaluateAlerts } from "./alerts.js";

/** Realistic nameplate wattages. Each device gets a fixed rating. */
const WATT_RANGES = {
  fan: [55, 75], // ceiling fan
  light: [12, 18], // LED tube/bulb
};

/** Per-room occupancy profile: probability a device *should* be ON. */
const OCCUPANCY = {
  // [duringHours, afterHours]
  drawing: { on: 0.45, after: 0.08 },
  work1: { on: 0.85, after: 0.1 },
  work2: { on: 0.8, after: 0.12 },
};

/**
 * Probability per tick that any given device flips toward its target
 * state. Low values = state changes feel organic, not strobe-like.
 */
const DRIFT_CHANCE = 0.12;

function randomInt([min, max]) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function isOfficeHours(date = new Date()) {
  const h = date.getHours();
  return h >= OFFICE_HOURS.start && h < OFFICE_HOURS.end;
}

/** Build the fixed catalogue of 15 devices with a plausible initial state. */
export function seedDevices() {
  const devices = [];
  const inHours = isOfficeHours();
  for (const room of ROOMS) {
    const profile = OCCUPANCY[room.id];
    const targetOnProb = inHours ? profile.on : profile.after;
    let fan = 0;
    let light = 0;
    for (const type of ["fan", "fan", "light", "light", "light"]) {
      const index = type === "fan" ? ++fan : ++light;
      const on = Math.random() < targetOnProb;
      // Stagger initial lastChanged over the past 3 hours so the
      // "on for more than 2h" rule can fire early in a demo.
      const changedAgoMs = Math.floor(Math.random() * 3 * 3_600_000);
      const changedAt = new Date(Date.now() - changedAgoMs);
      devices.push({
        id: `${room.id}-${type}-${index}`,
        room: room.id,
        roomName: room.name,
        type,
        name: `${type === "fan" ? "Fan" : "Light"} ${index}`,
        watts: randomInt(WATT_RANGES[type]),
        status: on ? "on" : "off",
        lastChanged: changedAt.toISOString(),
        onSince: on ? changedAt.toISOString() : null,
      });
    }
  }
  return devices;
}

/**
 * One simulation step:
 *  1. account the energy used since the last tick,
 *  2. drift device states toward the current occupancy profile,
 *  3. record a power-history point,
 *  4. re-evaluate alert rules,
 *  5. broadcast the fresh snapshot.
 */
function tick(elapsedMs) {
  store.accumulateEnergy(elapsedMs);

  const inHours = isOfficeHours();
  for (const device of store.devices) {
    const profile = OCCUPANCY[device.room];
    const targetOnProb = inHours ? profile.on : profile.after;
    if (Math.random() > DRIFT_CHANCE) continue; // most devices stay put

    // Decide the device's *desired* state this instant, then move
    // toward it. A device already in its desired state may still
    // briefly flip (someone walks in/out) with a small chance.
    const wantsOn = Math.random() < targetOnProb;
    const desired = wantsOn ? "on" : "off";
    if (device.status !== desired) {
      store.setDeviceStatus(device, desired);
    }
  }

  store.pushHistoryPoint();
  evaluateAlerts();
  store.emit("snapshot", store.snapshot());
}

/**
 * Start the simulator. Returns a stop() function (used by tests /
 * graceful shutdown).
 */
export function startSimulator(tickMs = Number(process.env.SIM_TICK_MS) || 5000) {
  if (store.devices.length === 0) {
    store.devices = seedDevices();
  }
  store.pushHistoryPoint();
  evaluateAlerts();

  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    tick(now - last);
    last = now;
  }, tickMs);
  timer.unref?.();
  console.log(
    `[simulator] running - ${store.devices.length} devices, tick every ${tickMs}ms`
  );
  return () => clearInterval(timer);
}
