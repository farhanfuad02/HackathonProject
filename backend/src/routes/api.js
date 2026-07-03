/**
 * REST API - the read surface of the shared backend.
 *
 * The dashboard mostly listens on Socket.IO, but every piece of data is
 * also available over plain HTTP so the system is easy to inspect,
 * test (curl) and integrate with.
 */

import { Router } from "express";
import { store, ROOMS } from "../state/store.js";
import { isDbConnected } from "../services/persistence.js";

export const api = Router();

/** Resolve loose room names ("work1", "Work Room 1", "drawing") to a room. */
function findRoom(nameOrId) {
  const q = String(nameOrId).toLowerCase().replace(/[\s_-]/g, "");
  return ROOMS.find(
    (r) =>
      r.id === q ||
      r.name.toLowerCase().replace(/\s/g, "") === q ||
      r.name.toLowerCase().replace(/\s/g, "").includes(q)
  );
}

/* ------------------------------------------------------------ health */

api.get("/health", (_req, res) => {
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    startedAt: store.startedAt,
    mongo: isDbConnected() ? "connected" : "in-memory fallback",
    devices: store.devices.length,
  });
});

/* ----------------------------------------------------------- devices */

api.get("/devices", (_req, res) => {
  res.json(store.devices);
});

api.get("/devices/:id", (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: "device not found" });
  res.json(device);
});

/**
 * Manual override - handy during demos ("watch the dashboard update
 * live") and mirrors what a real relay/switch integration would do.
 */
api.post("/devices/:id/toggle", (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: "device not found" });
  store.setDeviceStatus(device, device.status === "on" ? "off" : "on");
  store.emit("snapshot", store.snapshot());
  res.json(device);
});

/* ------------------------------------------------------------- rooms */

api.get("/rooms", (_req, res) => {
  res.json(
    ROOMS.map((room) => {
      const devices = store.devicesInRoom(room.id);
      return {
        ...room,
        watts: store.roomWatts(room.id),
        todayKwh: store.energy.perRoom[room.id],
        devices,
        onCount: devices.filter((d) => d.status === "on").length,
      };
    })
  );
});

api.get("/rooms/:name", (req, res) => {
  const room = findRoom(req.params.name);
  if (!room) {
    return res.status(404).json({
      error: `unknown room "${req.params.name}"`,
      valid: ROOMS.map((r) => r.id),
    });
  }
  res.json({
    ...room,
    watts: store.roomWatts(room.id),
    todayKwh: store.energy.perRoom[room.id],
    devices: store.devicesInRoom(room.id),
  });
});

/* ------------------------------------------------------------- usage */

api.get("/usage", (_req, res) => {
  res.json({
    totalWatts: store.totalWatts(),
    perRoom: Object.fromEntries(ROOMS.map((r) => [r.id, store.roomWatts(r.id)])),
    todayKwh: store.energy.totalKwh,
    todayKwhPerRoom: store.energy.perRoom,
    history: store.powerHistory,
  });
});

/* ------------------------------------------------------------ alerts */

api.get("/alerts", (req, res) => {
  const activeOnly = req.query.active === "true";
  res.json(activeOnly ? store.activeAlerts() : store.alerts);
});

/* ---------------------------------------------------------- snapshot */

/** Everything the dashboard needs in one call (initial page load). */
api.get("/snapshot", (_req, res) => {
  res.json(store.snapshot());
});
