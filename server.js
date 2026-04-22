const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");

const HOST = "127.0.0.1";
const PORT = 3000;
const STORE_PATH = path.join(__dirname, "data", "store.json");

const staticFiles = {
  "/": "index.html",
  "/admin": "admin.html",
  "/index.html": "index.html",
  "/admin.html": "admin.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
  "/admin.js": "admin.js",
};

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

let writeQueue = Promise.resolve();

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readStore() {
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeStore(nextStore) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(STORE_PATH, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8")
  );
  await writeQueue;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function getHotelTier(score) {
  if (score < -40) return { label: "Level 0 Fading Tavern", mood: "Critical standing" };
  if (score < 40) return { label: "Level 1 Adventurer Inn", mood: "Neutral standing" };
  if (score < 120) return { label: "Level 2 Heroic Lodge", mood: "Good standing" };
  return { label: "Level 3 Legendary Citadel", mood: "Excellent standing" };
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/store") {
    const store = await readStore();
    return jsonResponse(res, 200, store);
  }

  if (req.method === "POST" && pathname === "/api/hotels") {
    const body = await readJsonBody(req);
    const name = String(body.name || "").trim();
    if (!name) return jsonResponse(res, 400, { error: "Hotel name is required." });

    const store = await readStore();
    const nextHotel = {
      id: createId("hotel"),
      name,
      score: 0,
      stats: {},
      eventCounters: {},
      timeline: [],
    };
    store.hotels.push(nextHotel);
    await writeStore(store);
    return jsonResponse(res, 201, nextHotel);
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/hotels/")) {
    const hotelId = pathname.replace("/api/hotels/", "");
    const store = await readStore();
    const nextHotels = store.hotels.filter((hotel) => hotel.id !== hotelId);
    if (nextHotels.length === store.hotels.length) {
      return jsonResponse(res, 404, { error: "Hotel not found." });
    }
    store.hotels = nextHotels;
    await writeStore(store);
    return jsonResponse(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/events") {
    const body = await readJsonBody(req);
    const label = String(body.label || "").trim();
    const description = String(body.description || "").trim();
    const points = Number(body.points);
    if (!label || !description || Number.isNaN(points)) {
      return jsonResponse(res, 400, {
        error: "label, description and numeric points are required.",
      });
    }

    const store = await readStore();
    const nextEvent = {
      id: createId("event"),
      label,
      description,
      points,
      category: String(body.category || "custom"),
    };
    store.events.push(nextEvent);
    await writeStore(store);
    return jsonResponse(res, 201, nextEvent);
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/events/")) {
    const eventId = pathname.replace("/api/events/", "");
    const body = await readJsonBody(req);
    const nextPoints = Number(body.points);
    if (Number.isNaN(nextPoints)) {
      return jsonResponse(res, 400, { error: "A numeric points value is required." });
    }

    const store = await readStore();
    const eventItem = store.events.find((item) => item.id === eventId);
    if (!eventItem) return jsonResponse(res, 404, { error: "Event not found." });

    const previousPoints = eventItem.points;
    const pointsDelta = nextPoints - previousPoints;
    eventItem.points = nextPoints;

    if (pointsDelta !== 0) {
      store.hotels.forEach((hotel) => {
        hotel.eventCounters = hotel.eventCounters || {};
        hotel.timeline = Array.isArray(hotel.timeline) ? hotel.timeline : [];

        const countedUses = Number.isFinite(hotel.eventCounters[eventId])
          ? hotel.eventCounters[eventId]
          : hotel.timeline.filter((log) => log.eventId === eventId).length;
        if (countedUses > 0) {
          hotel.eventCounters[eventId] = countedUses;
        }

        if (countedUses > 0) {
          hotel.score += pointsDelta * countedUses;
          hotel.tier = getHotelTier(hotel.score);
        }

        hotel.timeline = hotel.timeline.map((log) =>
          log.eventId === eventId ? { ...log, points: nextPoints } : log
        );
      });
    }

    await writeStore(store);
    return jsonResponse(res, 200, { event: eventItem });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/events/")) {
    const eventId = pathname.replace("/api/events/", "");
    const store = await readStore();
    const nextEvents = store.events.filter((eventItem) => eventItem.id !== eventId);
    if (nextEvents.length === store.events.length) {
      return jsonResponse(res, 404, { error: "Event not found." });
    }
    store.events = nextEvents;
    await writeStore(store);
    return jsonResponse(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/log-event") {
    const body = await readJsonBody(req);
    const hotelId = String(body.hotelId || "");
    const eventId = String(body.eventId || "");

    const store = await readStore();
    const hotel = store.hotels.find((item) => item.id === hotelId);
    if (!hotel) return jsonResponse(res, 404, { error: "Hotel not found." });

    const eventItem = store.events.find((item) => item.id === eventId);
    if (!eventItem) return jsonResponse(res, 404, { error: "Event not found." });

    hotel.score += eventItem.points;
    const statKey = eventItem.category || "custom";
    hotel.stats[statKey] = (hotel.stats[statKey] || 0) + 1;
    hotel.eventCounters = hotel.eventCounters || {};
    hotel.eventCounters[eventItem.id] = (hotel.eventCounters[eventItem.id] || 0) + 1;
    hotel.timeline.unshift({
      eventId: eventItem.id,
      label: eventItem.label,
      description: eventItem.description,
      points: eventItem.points,
      createdAt: new Date().toISOString(),
    });
    hotel.tier = getHotelTier(hotel.score);

    await writeStore(store);
    return jsonResponse(res, 200, { hotel });
  }

  return false;
}

async function serveStaticFile(res, pathname) {
  const mapped = staticFiles[pathname];
  if (!mapped) return false;

  const filePath = path.join(__dirname, mapped);
  const ext = path.extname(filePath);
  const mimeType = mimeByExt[ext] || "application/octet-stream";

  try {
    await fs.access(filePath);
    res.writeHead(200, { "Content-Type": mimeType });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, pathname);
      if (handled !== false) return;
      return jsonResponse(res, 404, { error: "API route not found." });
    }

    const served = await serveStaticFile(res, pathname);
    if (served) return;

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || "Internal server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`RPG Hotel Dashboard running at http://${HOST}:${PORT}`);
});
