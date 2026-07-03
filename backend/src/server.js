/**
 * Entry point - wires every layer of the shared backend together:
 *
 *   [Simulated Device Layer]  services/simulator.js
 *              |
 *              v
 *   [Single source of truth]  state/store.js  (+ MongoDB mirror)
 *              |
 *      +-------+--------+
 *      v                v
 *  [REST + Socket.IO]  [Discord bot]
 *   routes/api.js       bot/index.js
 *      |                    |
 *      v                    v
 *  Web dashboard        Discord users
 */

import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";

import { store } from "./state/store.js";
import { startSimulator, seedDevices } from "./services/simulator.js";
import { initPersistence } from "./services/persistence.js";
import { api } from "./routes/api.js";
import { startBot } from "./bot/index.js";

const PORT = Number(process.env.PORT) || 4000;

async function main() {
  /* 1. Seed devices first so persistence can restore onto them. */
  store.devices = seedDevices();

  /* 2. Optional MongoDB mirror (restore + continuous sync). */
  await initPersistence();

  /* 3. HTTP server: REST API + Socket.IO realtime feed. */
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", api);

  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: "*" }, // demo project - lock down in production
  });

  // New dashboard clients get the current state immediately...
  io.on("connection", (socket) => {
    socket.emit("state", store.snapshot());
  });
  // ...and everyone gets a push after every simulator tick.
  store.on("snapshot", (snap) => io.emit("state", snap));

  /* 4. Simulated device layer - drives the whole system. */
  startSimulator();

  /* 5. Discord bot (same process, same store). */
  startBot();

  server.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
