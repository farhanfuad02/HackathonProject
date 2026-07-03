/**
 * demoSim - in-browser stand-in for the backend, used for the static
 * GitHub Pages build (VITE_DEMO=true).
 *
 * GitHub Pages can only serve static files, so the Express/Socket.IO
 * backend can't run there. This module ports the backend's simulator,
 * store and alert rules (backend/src/services + state) into the browser
 * and emits the exact same snapshot shape that useLiveState expects,
 * so every component works unchanged.
 *
 * Behaviour mirrors the backend:
 *   - 3 rooms x (2 fans + 3 lights) = 15 devices, occupancy-aware drift
 *   - daily kWh accounting per room
 *   - after-hours + long-running alert rules with auto-resolve
 *   - a tick every 5 s pushing a fresh snapshot
 * Plus one demo nicety: history is backfilled ~15 minutes so the
 * power sparkline is populated on first paint.
 */

/* ------------------------------------------------ fixed office layout */

const ROOMS = [
  { id: "drawing", name: "Drawing Room" },
  { id: "work1", name: "Work Room 1" },
  { id: "work2", name: "Work Room 2" },
];

const OFFICE_HOURS = { start: 9, end: 17 };
const HISTORY_LIMIT = 180;
const TWO_HOURS_MS = 2 * 3_600_000;

const WATT_RANGES = {
  fan: [55, 75],
  light: [12, 18],
};

const OCCUPANCY = {
  drawing: { on: 0.45, after: 0.08 },
  work1: { on: 0.85, after: 0.1 },
  work2: { on: 0.8, after: 0.12 },
};

const DRIFT_CHANCE = 0.12;

/* --------------------------------------------------------- state */

let devices = [];
let alerts = [];
let powerHistory = [];
let energy = null;
let emit = null; // snapshot callback, set by startDemoSim

/* ------------------------------------------------------- helpers */

function randomInt([min, max]) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function isOfficeHours(date) {
  const h = date.getHours();
  return h >= OFFICE_HOURS.start && h < OFFICE_HOURS.end;
}

function localDateKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function deviceWatts(d) {
  return d.status === "on" ? d.watts : 0;
}

function roomWatts(roomId) {
  return devices
    .filter((d) => d.room === roomId)
    .reduce((sum, d) => sum + deviceWatts(d), 0);
}

function totalWatts() {
  return devices.reduce((sum, d) => sum + deviceWatts(d), 0);
}

/* -------------------------------------------------------- seeding */

function seedDevices(now) {
  const seeded = [];
  const inHours = isOfficeHours(now);
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
      const changedAt = new Date(now.getTime() - changedAgoMs);
      seeded.push({
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
  return seeded;
}

/* ------------------------------------------------------ mutations */

function setDeviceStatus(device, status, when) {
  if (device.status === status) return;
  device.status = status;
  device.lastChanged = when.toISOString();
  device.onSince = status === "on" ? when.toISOString() : null;
}

function accumulateEnergy(elapsedMs, now) {
  const key = localDateKey(now);
  if (!energy || key !== energy.date) {
    energy = {
      date: key,
      totalKwh: 0,
      perRoom: Object.fromEntries(ROOMS.map((r) => [r.id, 0])),
    };
  }
  const hours = elapsedMs / 3_600_000;
  for (const room of ROOMS) {
    const kwh = (roomWatts(room.id) / 1000) * hours;
    energy.perRoom[room.id] += kwh;
    energy.totalKwh += kwh;
  }
}

function pushHistoryPoint(now) {
  powerHistory.push({ t: now.toISOString(), watts: totalWatts() });
  if (powerHistory.length > HISTORY_LIMIT) {
    powerHistory.splice(0, powerHistory.length - HISTORY_LIMIT);
  }
}

function raiseAlert({ key, type, room, message }, now) {
  if (alerts.some((a) => a.active && a.key === key)) return;
  alerts.unshift({
    id: `alr-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    key,
    type,
    room,
    message,
    createdAt: now.toISOString(),
    active: true,
    resolvedAt: null,
  });
  if (alerts.length > 100) alerts.length = 100;
}

function resolveAlerts(key, now) {
  for (const alert of alerts) {
    if (alert.active && alert.key === key) {
      alert.active = false;
      alert.resolvedAt = now.toISOString();
    }
  }
}

/* ---------------------------------------------------- alert rules */

function describeOnDevices(list) {
  const fans = list.filter((d) => d.type === "fan").length;
  const lights = list.filter((d) => d.type === "light").length;
  const parts = [];
  if (fans) parts.push(`${fans} fan${fans > 1 ? "s" : ""}`);
  if (lights) parts.push(`${lights} light${lights > 1 ? "s" : ""}`);
  return parts.join(" and ");
}

function evaluateAlerts(now) {
  const h = now.getHours();
  const afterHours = h < OFFICE_HOURS.start || h >= OFFICE_HOURS.end;

  for (const room of ROOMS) {
    const roomDevices = devices.filter((d) => d.room === room.id);
    const onDevices = roomDevices.filter((d) => d.status === "on");

    const afterHoursKey = `afterhours:${room.id}`;
    if (afterHours && onDevices.length > 0) {
      raiseAlert(
        {
          key: afterHoursKey,
          type: "after-hours",
          room: room.id,
          message: `${room.name} still has ${describeOnDevices(
            onDevices
          )} ON outside office hours (${OFFICE_HOURS.start}:00-${OFFICE_HOURS.end}:00).`,
        },
        now
      );
    } else {
      resolveAlerts(afterHoursKey, now);
    }

    const longRunKey = `longrun:${room.id}`;
    const allOnLong =
      onDevices.length === roomDevices.length &&
      roomDevices.every(
        (d) => d.onSince && now - new Date(d.onSince) > TWO_HOURS_MS
      );
    if (allOnLong) {
      raiseAlert(
        {
          key: longRunKey,
          type: "long-running",
          room: room.id,
          message: `Every device in ${room.name} has been ON for more than 2 hours straight - is anyone actually there?`,
        },
        now
      );
    } else {
      resolveAlerts(longRunKey, now);
    }
  }
}

/* ----------------------------------------------------- simulation */

function drift(now) {
  const inHours = isOfficeHours(now);
  for (const device of devices) {
    const profile = OCCUPANCY[device.room];
    const targetOnProb = inHours ? profile.on : profile.after;
    if (Math.random() > DRIFT_CHANCE) continue;
    const desired = Math.random() < targetOnProb ? "on" : "off";
    if (device.status !== desired) {
      setDeviceStatus(device, desired, now);
    }
  }
}

function snapshot(now) {
  // Clone mutable entries: the socket path delivers fresh objects on
  // every tick, so consumers may rely on reference inequality.
  return {
    time: now.toISOString(),
    rooms: ROOMS,
    devices: devices.map((d) => ({ ...d })),
    power: {
      totalWatts: totalWatts(),
      perRoom: Object.fromEntries(ROOMS.map((r) => [r.id, roomWatts(r.id)])),
      todayKwh: round3(energy.totalKwh),
      todayKwhPerRoom: Object.fromEntries(
        Object.entries(energy.perRoom).map(([k, v]) => [k, round3(v)])
      ),
    },
    history: powerHistory.slice(),
    alerts: alerts.slice(0, 50),
    officeHours: OFFICE_HOURS,
  };
}

/**
 * Manual override, mirroring POST /api/devices/:id/toggle on the real
 * backend: flip the device and push a fresh snapshot immediately.
 * (The occupancy drift may still flip it back on a later tick - the
 * backend simulator behaves the same way.)
 */
export function toggleDemoDevice(id) {
  const device = devices.find((d) => d.id === id);
  if (!device || !emit) return;
  const now = new Date();
  setDeviceStatus(device, device.status === "on" ? "off" : "on", now);
  emit(snapshot(now));
}

/**
 * Start the in-browser simulator. Calls onSnapshot immediately with a
 * fully backfilled state, then every tick. Returns a stop() function.
 */
export function startDemoSim(onSnapshot, tickMs = 5000) {
  const now = new Date();
  devices = seedDevices(now);
  alerts = [];
  powerHistory = [];
  energy = null;
  emit = onSnapshot;

  // Backfill: replay ticks over the past ~15 minutes with a virtual
  // clock so the sparkline and kWh counters look lived-in at load.
  const backfillTicks = HISTORY_LIMIT - 1;
  let virtual = new Date(now.getTime() - backfillTicks * tickMs);
  accumulateEnergy(0, virtual);
  pushHistoryPoint(virtual);
  for (let i = 0; i < backfillTicks; i++) {
    virtual = new Date(virtual.getTime() + tickMs);
    accumulateEnergy(tickMs, virtual);
    drift(virtual);
    pushHistoryPoint(virtual);
  }

  evaluateAlerts(now);
  onSnapshot(snapshot(now));

  const timer = setInterval(() => {
    const tickNow = new Date();
    accumulateEnergy(tickMs, tickNow);
    drift(tickNow);
    pushHistoryPoint(tickNow);
    evaluateAlerts(tickNow);
    onSnapshot(snapshot(tickNow));
  }, tickMs);

  return () => clearInterval(timer);
}
