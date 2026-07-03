/**
 * In-memory single source of truth for the whole system.
 *
 * Both interfaces (web dashboard via Socket.IO/REST, Discord bot) read
 * from this store, satisfying the "one backend, one source of truth"
 * architecture requirement. MongoDB (when available) mirrors this state
 * for persistence across restarts - see services/persistence.js.
 *
 * The store is also an EventEmitter so downstream consumers (Socket.IO
 * broadcaster, Discord alert poster, Mongo persistence) can react to
 * changes without polling.
 *
 * Emitted events:
 *   - "snapshot"   (state)  -> after every simulator tick
 *   - "alert:new"  (alert)  -> when a new alert becomes active
 *   - "alert:resolved" (alert)
 */

import { EventEmitter } from "node:events";

/** Fixed office layout - given by the problem statement. */
export const ROOMS = [
  { id: "drawing", name: "Drawing Room" },
  { id: "work1", name: "Work Room 1" },
  { id: "work2", name: "Work Room 2" },
];

/** Office hours used by the alert rules (9 AM - 5 PM). */
export const OFFICE_HOURS = { start: 9, end: 17 };

/** How many power-history points to keep for the dashboard sparkline. */
const HISTORY_LIMIT = 180;

class Store extends EventEmitter {
  constructor() {
    super();
    /** @type {Array<object>} all 15 devices */
    this.devices = [];
    /** @type {Array<object>} active + recently resolved alerts */
    this.alerts = [];
    /** @type {Array<{t: string, watts: number}>} total-power time series */
    this.powerHistory = [];
    /** Daily energy accounting (kWh), reset at local midnight. */
    this.energy = {
      date: localDateKey(),
      totalKwh: 0,
      perRoom: Object.fromEntries(ROOMS.map((r) => [r.id, 0])),
    };
    this.startedAt = new Date().toISOString();
  }

  /* ---------------------------------------------------------- queries */

  getDevice(id) {
    return this.devices.find((d) => d.id === id);
  }

  devicesInRoom(roomId) {
    return this.devices.filter((d) => d.room === roomId);
  }

  /** Current draw of a single device (0 when off). */
  deviceWatts(device) {
    return device.status === "on" ? device.watts : 0;
  }

  /** Live total power for one room, in watts. */
  roomWatts(roomId) {
    return this.devicesInRoom(roomId).reduce(
      (sum, d) => sum + this.deviceWatts(d),
      0
    );
  }

  /** Live total power for the whole office, in watts. */
  totalWatts() {
    return this.devices.reduce((sum, d) => sum + this.deviceWatts(d), 0);
  }

  activeAlerts() {
    return this.alerts.filter((a) => a.active);
  }

  /** Compact JSON snapshot pushed to dashboard clients on every tick. */
  snapshot() {
    return {
      time: new Date().toISOString(),
      rooms: ROOMS,
      devices: this.devices,
      power: {
        totalWatts: this.totalWatts(),
        perRoom: Object.fromEntries(
          ROOMS.map((r) => [r.id, this.roomWatts(r.id)])
        ),
        todayKwh: round3(this.energy.totalKwh),
        todayKwhPerRoom: Object.fromEntries(
          Object.entries(this.energy.perRoom).map(([k, v]) => [k, round3(v)])
        ),
      },
      history: this.powerHistory,
      alerts: this.alerts.slice(0, 50),
      officeHours: OFFICE_HOURS,
    };
  }

  /* -------------------------------------------------------- mutations */

  /** Flip a device and stamp the change time. Used by simulator + API. */
  setDeviceStatus(device, status, when = new Date()) {
    if (device.status === status) return;
    device.status = status;
    device.lastChanged = when.toISOString();
    device.onSince = status === "on" ? when.toISOString() : null;
  }

  /** Add energy (kWh) consumed since the previous tick. */
  accumulateEnergy(elapsedMs) {
    const key = localDateKey();
    if (key !== this.energy.date) {
      // New day - reset the daily counters.
      this.energy = {
        date: key,
        totalKwh: 0,
        perRoom: Object.fromEntries(ROOMS.map((r) => [r.id, 0])),
      };
    }
    const hours = elapsedMs / 3_600_000;
    for (const room of ROOMS) {
      const kwh = (this.roomWatts(room.id) / 1000) * hours;
      this.energy.perRoom[room.id] += kwh;
      this.energy.totalKwh += kwh;
    }
  }

  pushHistoryPoint() {
    this.powerHistory.push({
      t: new Date().toISOString(),
      watts: this.totalWatts(),
    });
    if (this.powerHistory.length > HISTORY_LIMIT) {
      this.powerHistory.splice(0, this.powerHistory.length - HISTORY_LIMIT);
    }
  }

  /**
   * Raise an alert if an identical active one (same key) doesn't already
   * exist - keeps the panel readable instead of flooding duplicates.
   */
  raiseAlert({ key, type, room, message }) {
    if (this.alerts.some((a) => a.active && a.key === key)) return null;
    const alert = {
      id: `alr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      key,
      type,
      room,
      message,
      createdAt: new Date().toISOString(),
      active: true,
      resolvedAt: null,
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > 100) this.alerts.length = 100;
    this.emit("alert:new", alert);
    return alert;
  }

  /** Resolve every active alert matching the key (condition cleared). */
  resolveAlerts(key) {
    for (const alert of this.alerts) {
      if (alert.active && alert.key === key) {
        alert.active = false;
        alert.resolvedAt = new Date().toISOString();
        this.emit("alert:resolved", alert);
      }
    }
  }
}

/* ------------------------------------------------------------ helpers */

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** Singleton store shared by the API, Socket.IO and the Discord bot. */
export const store = new Store();
