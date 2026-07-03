/**
 * Discord bot - the boss's quick-access remote control.
 *
 * Runs inside the same process as the API/dashboard server and reads
 * from the same in-memory store, so both interfaces always reflect the
 * same reality (one backend, one source of truth).
 *
 * Commands:
 *   !status        - whole-office device summary, room by room
 *   !room <name>   - one room in detail        (e.g. !room work1)
 *   !usage         - live watts + today's estimated kWh
 *   !alerts        - currently active alerts
 *   !help          - command list
 *
 * Bonus: proactively posts to DISCORD_ALERT_CHANNEL_ID whenever a new
 * alert condition triggers.
 */

import { Client, GatewayIntentBits, Partials } from "discord.js";
import { store, ROOMS } from "../state/store.js";
import { humanize, isLlmEnabled } from "./humanizer.js";

const PREFIX = "!";

/* ----------------------------------------------------- fact builders */

function roomFacts(room) {
  const devices = store.devicesInRoom(room.id);
  const on = devices.filter((d) => d.status === "on");
  return {
    room: room.name,
    fansOn: on.filter((d) => d.type === "fan").length,
    totalFans: devices.filter((d) => d.type === "fan").length,
    lightsOn: on.filter((d) => d.type === "light").length,
    totalLights: devices.filter((d) => d.type === "light").length,
    watts: store.roomWatts(room.id),
    devices: devices.map((d) => ({ name: d.name, status: d.status })),
  };
}

function roomPhrase(f) {
  if (f.fansOn === 0 && f.lightsOn === 0) return `${f.room}: all off`;
  const bits = [];
  if (f.fansOn) bits.push(`${f.fansOn} fan${f.fansOn > 1 ? "s" : ""} ON`);
  if (f.lightsOn)
    bits.push(`${f.lightsOn} light${f.lightsOn > 1 ? "s" : ""} ON`);
  return `${f.room}: ${bits.join(", ")}`;
}

function findRoom(query) {
  const q = String(query || "").toLowerCase().replace(/[\s_-]/g, "");
  if (!q) return null;
  return ROOMS.find(
    (r) =>
      r.id === q || r.name.toLowerCase().replace(/\s/g, "").includes(q)
  );
}

/* -------------------------------------------------- command handlers */

async function handleStatus() {
  const facts = ROOMS.map((r) => roomFacts(r));
  const fallback = facts.map(roomPhrase).join(". ") + ".";
  return humanize("current office status, room by room", { rooms: facts }, fallback);
}

async function handleRoom(arg) {
  const room = findRoom(arg);
  if (!room) {
    return `I don't know a room called "${arg}". Try one of: ${ROOMS.map(
      (r) => `\`${r.id}\``
    ).join(", ")}`;
  }
  const f = roomFacts(room);
  const list = f.devices
    .map((d) => `${d.status === "on" ? "🟢" : "⚫"} ${d.name}`)
    .join("  ");
  const fallback = `${roomPhrase(f)} — drawing ${f.watts}W right now.\n${list}`;
  return humanize(`status of ${room.name}`, f, fallback);
}

async function handleUsage() {
  const facts = {
    totalWattsNow: store.totalWatts(),
    todayEstimatedKwh: Math.round(store.energy.totalKwh * 100) / 100,
    perRoomWatts: Object.fromEntries(
      ROOMS.map((r) => [r.name, store.roomWatts(r.id)])
    ),
  };
  const fallback = `Total power right now: ${facts.totalWattsNow}W. Today's estimated usage: ${facts.todayEstimatedKwh} kWh.`;
  return humanize("current power usage and today's energy", facts, fallback);
}

async function handleAlerts() {
  const active = store.activeAlerts();
  if (active.length === 0) {
    return humanize(
      "active alerts (there are none)",
      { activeAlerts: [] },
      "No active alerts - the office is behaving itself. ✅"
    );
  }
  const facts = {
    activeAlerts: active.map((a) => ({
      message: a.message,
      since: a.createdAt,
    })),
  };
  const fallback = active
    .map((a) => `⚠️ ${a.message} (since ${new Date(a.createdAt).toLocaleTimeString()})`)
    .join("\n");
  return humanize("active alerts", facts, fallback);
}

function handleHelp() {
  return [
    "**Office Electricity Bot** - commands:",
    "`!status` - who left what on, room by room",
    "`!room <name>` - one room in detail (drawing / work1 / work2)",
    "`!usage` - live power draw + today's estimated kWh",
    "`!alerts` - anything anomalous right now",
  ].join("\n");
}

/* ------------------------------------------------------------ wiring */

export function startBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("[bot] DISCORD_BOT_TOKEN not set - Discord bot disabled");
    return null;
  }

  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  bot.once("ready", () => {
    console.log(
      `[bot] logged in as ${bot.user.tag} (LLM replies: ${
        isLlmEnabled() ? "Claude" : "templates"
      })`
    );
  });

  bot.on("messageCreate", async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    const [command, ...args] = message.content
      .slice(PREFIX.length)
      .trim()
      .split(/\s+/);

    try {
      let reply;
      switch (command.toLowerCase()) {
        case "status":
          reply = await handleStatus();
          break;
        case "room":
          reply = await handleRoom(args.join(" "));
          break;
        case "usage":
          reply = await handleUsage();
          break;
        case "alerts":
          reply = await handleAlerts();
          break;
        case "help":
          reply = handleHelp();
          break;
        default:
          return; // ignore unknown commands silently
      }
      await message.reply(reply);
    } catch (err) {
      console.error(`[bot] command "${command}" failed:`, err);
      await message.reply("Something went wrong on my end - try again in a moment.");
    }
  });

  /* Bonus: proactive alert posts to a designated channel. */
  const alertChannelId = process.env.DISCORD_ALERT_CHANNEL_ID;
  if (alertChannelId) {
    store.on("alert:new", async (alert) => {
      try {
        const channel = await bot.channels.fetch(alertChannelId);
        const text = await humanize(
          "a new alert just triggered - warn the team",
          { alert: { message: alert.message, at: alert.createdAt } },
          `⚠️ ${alert.message}`
        );
        await channel.send(text);
      } catch (err) {
        console.warn(`[bot] could not post alert: ${err.message}`);
      }
    });
  }

  bot.login(token).catch((err) => {
    console.error(`[bot] login failed: ${err.message} - bot disabled`);
  });
  return bot;
}
