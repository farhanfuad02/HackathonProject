/**
 * MongoDB persistence layer (optional but recommended).
 *
 * The in-memory store stays the source of truth for live reads - it is
 * faster and always available. Mongo mirrors that state so device
 * history, alerts and today's energy counters survive a restart.
 *
 * If MongoDB is unreachable the server logs a warning and continues in
 * memory-only mode - the demo never goes down because a DB is missing.
 */

import mongoose from "mongoose";
import { store } from "../state/store.js";

const deviceSchema = new mongoose.Schema(
  {
    _id: String, // e.g. "work1-fan-1"
    room: String,
    roomName: String,
    type: { type: String, enum: ["fan", "light"] },
    name: String,
    watts: Number,
    status: { type: String, enum: ["on", "off"] },
    lastChanged: String,
    onSince: String,
  },
  { versionKey: false }
);

const alertSchema = new mongoose.Schema(
  {
    _id: String,
    key: String,
    type: String,
    room: String,
    message: String,
    createdAt: String,
    active: Boolean,
    resolvedAt: String,
  },
  { versionKey: false }
);

const energySchema = new mongoose.Schema(
  {
    _id: String, // local date key, e.g. "2026-7-3"
    totalKwh: Number,
    perRoom: Object,
  },
  { versionKey: false }
);

const Device = mongoose.model("Device", deviceSchema);
const Alert = mongoose.model("Alert", alertSchema);
const EnergyDay = mongoose.model("EnergyDay", energySchema);

let connected = false;

export function isDbConnected() {
  return connected;
}

/**
 * Connect to Mongo, restore any persisted state into the store, then
 * keep Mongo in sync after every simulator tick.
 */
export async function initPersistence() {
  const uri =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/office-monitor";
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    connected = true;
    console.log("[db] connected to MongoDB");
  } catch (err) {
    console.warn(
      `[db] MongoDB unavailable (${err.message}) - continuing with in-memory store only`
    );
    return;
  }

  await restoreState();

  // Mirror the live state into Mongo after each tick. Fire-and-forget:
  // persistence must never slow down or crash the realtime loop.
  store.on("snapshot", () => {
    syncState().catch((err) =>
      console.warn(`[db] sync failed: ${err.message}`)
    );
  });
}

/** Load persisted devices/energy back into the in-memory store on boot. */
async function restoreState() {
  const [devices, energy] = await Promise.all([
    Device.find().lean(),
    EnergyDay.findById(store.energy.date).lean(),
  ]);

  if (devices.length === store.devices.length || store.devices.length === 0) {
    for (const saved of devices) {
      const live = store.getDevice(saved._id);
      if (live) {
        Object.assign(live, {
          status: saved.status,
          lastChanged: saved.lastChanged,
          onSince: saved.onSince,
          watts: saved.watts,
        });
      }
    }
    if (devices.length) console.log(`[db] restored ${devices.length} devices`);
  }

  if (energy) {
    store.energy.totalKwh = energy.totalKwh;
    store.energy.perRoom = { ...store.energy.perRoom, ...energy.perRoom };
    console.log(`[db] restored today's energy (${energy.totalKwh} kWh)`);
  }
}

let syncing = false;

/** Upsert current devices, alerts and energy counters. */
async function syncState() {
  if (syncing) return; // skip a beat rather than queue up writes
  syncing = true;
  try {
    await Promise.all([
      Device.bulkWrite(
        store.devices.map((d) => ({
          replaceOne: {
            filter: { _id: d.id },
            replacement: { ...d, _id: d.id, id: undefined },
            upsert: true,
          },
        }))
      ),
      Alert.bulkWrite(
        store.alerts.slice(0, 20).map((a) => ({
          replaceOne: {
            filter: { _id: a.id },
            replacement: { ...a, _id: a.id, id: undefined },
            upsert: true,
          },
        }))
      ),
      EnergyDay.replaceOne(
        { _id: store.energy.date },
        {
          totalKwh: store.energy.totalKwh,
          perRoom: store.energy.perRoom,
        },
        { upsert: true }
      ),
    ]);
  } finally {
    syncing = false;
  }
}
