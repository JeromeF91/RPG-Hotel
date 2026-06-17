const state = {
  hotels: [],
  events: [],
  activeHotelId: "",
};

const demo = {
  enabled: false,
  timeoutId: null,
  minDelayMs: 3500,
  maxDelayMs: 9000,
};

const hotelNameEl = document.getElementById("hotel-name");
const hotelSelectEl = document.getElementById("hotel-select");
const scoreValueEl = document.getElementById("score-value");
const scoreMeterEl = document.getElementById("score-meter");
const scoreStatusEl = document.getElementById("score-status");
const levelEl = document.getElementById("hotel-level");
const timelineEl = document.getElementById("timeline");
const timelineTemplate = document.getElementById("timeline-item-template");
const statsListEl = document.getElementById("stats-list");
const eventButtonsEl = document.getElementById("event-buttons");
const demoToggleEl = document.getElementById("demo-toggle");
const demoToastsEl = document.getElementById("demo-toasts");
const cyberGradeEl = document.getElementById("cyber-grade");
const cyberPointsEl = document.getElementById("cyber-points");
const cyberRefreshEl = document.getElementById("cyber-refresh");
const cyberGradeButtonsEl = document.getElementById("cyber-grade-buttons");

const CYBER_INDEX_GRADES = ["E", "D", "C", "B", "A"];

const CYBER_INDEX_POINTS = {
  A: 40,
  B: 20,
  C: 0,
  D: -20,
  E: -40,
};

const CYBER_INDEX_REFRESH_MONTHS = 6;

function formatPoints(points) {
  return points > 0 ? `+${points}` : `${points}`;
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeFrequency(value) {
  const frequency = String(value || "repeatable").trim().toLowerCase();
  if (frequency === "once" || frequency === "yearly") return frequency;
  return "repeatable";
}

function getEventLogs(hotel, eventId) {
  return (hotel.timeline || []).filter((log) => log.eventId === eventId);
}

function getEventAvailability(hotel, eventItem) {
  const frequency = normalizeFrequency(eventItem.frequency);
  const logs = getEventLogs(hotel, eventItem.id);

  if (frequency === "repeatable") {
    return { available: true, frequency };
  }

  if (frequency === "once") {
    if (logs.length > 0) {
      return {
        available: false,
        frequency,
        reason: "Already logged — one-time control.",
      };
    }
    return { available: true, frequency };
  }

  const year = new Date().getFullYear();
  const loggedThisYear = logs.some((log) => new Date(log.createdAt).getFullYear() === year);
  if (loggedThisYear) {
    return {
      available: false,
      frequency,
      reason: `Already logged in ${year} — available again next year.`,
      nextEligibleYear: year + 1,
    };
  }

  return { available: true, frequency };
}

function formatFrequencyLabel(frequency) {
  if (frequency === "once") return "One-time";
  if (frequency === "yearly") return "Yearly";
  return "Repeatable";
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getCyberIndexAvailability(hotel) {
  const cyberIndex = hotel.cyberIndex || null;
  if (!cyberIndex?.lastAssessedAt) {
    return { available: true, grade: cyberIndex?.grade || null };
  }

  const nextEligibleAt = addMonths(new Date(cyberIndex.lastAssessedAt), CYBER_INDEX_REFRESH_MONTHS);
  if (Date.now() >= nextEligibleAt.getTime()) {
    return {
      available: true,
      grade: cyberIndex.grade,
      lastAssessedAt: cyberIndex.lastAssessedAt,
      nextEligibleAt: nextEligibleAt.toISOString(),
    };
  }

  return {
    available: false,
    grade: cyberIndex.grade,
    lastAssessedAt: cyberIndex.lastAssessedAt,
    nextEligibleAt: nextEligibleAt.toISOString(),
    reason: `Next refresh on ${formatTime(nextEligibleAt)}.`,
  };
}

async function setCyberIndex(grade, hotelId = state.activeHotelId) {
  const response = await fetch("/api/cyber-index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hotelId, grade }),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "Failed to update Cyber Index.");
  }

  const payload = await response.json();
  state.hotels = state.hotels.map((hotel) =>
    hotel.id === payload.hotel.id ? payload.hotel : hotel
  );
  return payload.hotel;
}

async function fetchStore() {
  const response = await fetch("/api/store");
  if (!response.ok) throw new Error("Unable to load dashboard data.");
  return response.json();
}

async function logEvent(eventId, hotelId = state.activeHotelId, { createdAt } = {}) {
  const body = { hotelId, eventId };
  if (createdAt) body.createdAt = createdAt;

  const response = await fetch("/api/log-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "Failed to log event.");
  }

  const payload = await response.json();
  state.hotels = state.hotels.map((hotel) =>
    hotel.id === payload.hotel.id ? payload.hotel : hotel
  );
  return payload.hotel;
}

function pickRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomDelayMs() {
  return demo.minDelayMs + Math.random() * (demo.maxDelayMs - demo.minDelayMs);
}

function monthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

function randomDateBetween(start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const offset = Math.random() * (endMs - startMs);
  return new Date(startMs + offset).toISOString();
}

function randomDateInYear(year) {
  const now = new Date();
  const start = new Date(year, 0, 1);
  const end =
    year === now.getFullYear()
      ? now
      : new Date(year, 11, 31, 23, 59, 59, 999);
  return randomDateBetween(start, end);
}

function pickDemoEventDate(hotel, eventItem) {
  const frequency = normalizeFrequency(eventItem.frequency);
  const logs = getEventLogs(hotel, eventItem.id);
  const now = new Date();
  const lookbackStart = monthsAgo(24);

  if (frequency === "yearly") {
    const usedYears = new Set(logs.map((log) => new Date(log.createdAt).getFullYear()));
    const candidateYears = [];
    for (let year = now.getFullYear() - 2; year <= now.getFullYear(); year += 1) {
      if (!usedYears.has(year)) candidateYears.push(year);
    }
    if (candidateYears.length) {
      return randomDateInYear(pickRandomItem(candidateYears));
    }
  }

  return randomDateBetween(lookbackStart, now);
}

function showDemoToast(hotel, eventItem, createdAt) {
  const toast = document.createElement("div");
  toast.className = "demo-toast";

  const header = document.createElement("div");
  header.className = "demo-toast-header";

  const title = document.createElement("span");
  title.textContent = eventItem.label;

  const points = document.createElement("span");
  points.className = `demo-toast-points ${eventItem.points >= 0 ? "good" : "bad"}`;
  points.textContent = formatPoints(eventItem.points);

  const hotelLine = document.createElement("p");
  hotelLine.className = "demo-toast-hotel";
  hotelLine.textContent = hotel.name;

  const description = document.createElement("p");
  description.className = "demo-toast-description";
  description.textContent = eventItem.description;

  const timeLine = document.createElement("small");
  timeLine.className = "demo-toast-time";
  timeLine.textContent = formatTime(createdAt);

  header.append(title, points);
  toast.append(header, hotelLine, description, timeLine);
  demoToastsEl.prepend(toast);

  const dismiss = () => {
    if (toast.classList.contains("is-leaving")) return;
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  window.setTimeout(dismiss, 5000);
}

function setDemoEnabled(enabled) {
  demo.enabled = enabled;
  demoToggleEl.classList.toggle("is-active", enabled);
  demoToggleEl.setAttribute("aria-pressed", String(enabled));
  demoToggleEl.textContent = enabled ? "Demo Mode: On" : "Demo Mode";

  if (enabled) {
    scheduleDemoEvent();
    return;
  }

  if (demo.timeoutId) {
    window.clearTimeout(demo.timeoutId);
    demo.timeoutId = null;
  }
}

function scheduleDemoEvent() {
  if (!demo.enabled) return;

  demo.timeoutId = window.setTimeout(async () => {
    demo.timeoutId = null;
    await fireRandomDemoEvent();
    scheduleDemoEvent();
  }, randomDelayMs());
}

async function fireRandomDemoEvent() {
  if (!demo.enabled || !state.hotels.length || !state.events.length) return;

  const candidates = [];
  state.hotels.forEach((hotel) => {
    state.events.forEach((eventItem) => {
      if (getEventAvailability(hotel, eventItem).available) {
        candidates.push({ hotel, eventItem });
      }
    });
  });

  if (!candidates.length) return;

  const { hotel, eventItem } = pickRandomItem(candidates);
  const simulatedAt = pickDemoEventDate(hotel, eventItem);

  try {
    const updatedHotel = await logEvent(eventItem.id, hotel.id, { createdAt: simulatedAt });
    showDemoToast(updatedHotel, eventItem, simulatedAt);

    if (updatedHotel.id === state.activeHotelId) {
      render();
    } else {
      renderEventButtons();
    }
  } catch (error) {
    console.error("Demo event failed:", error);
  }
}

function getActiveHotel() {
  return state.hotels.find((item) => item.id === state.activeHotelId) || null;
}

function renderHotelSelector() {
  hotelSelectEl.innerHTML = "";
  state.hotels.forEach((hotel) => {
    const option = document.createElement("option");
    option.value = hotel.id;
    option.textContent = hotel.name;
    hotelSelectEl.appendChild(option);
  });

  if (!state.activeHotelId && state.hotels[0]) {
    state.activeHotelId = state.hotels[0].id;
  }
  hotelSelectEl.value = state.activeHotelId;
}

function renderStats(hotel) {
  statsListEl.innerHTML = "";
  const entries = Object.entries(hotel.stats || {});
  if (!entries.length) {
    const li = document.createElement("li");
    li.innerHTML = "<span>No stat yet</span><strong>0</strong>";
    statsListEl.appendChild(li);
    return;
  }

  entries.forEach(([key, value]) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${key}</span><strong>${value}</strong>`;
    statsListEl.appendChild(li);
  });
}

function renderEventButtons() {
  eventButtonsEl.innerHTML = "";
  const hotel = getActiveHotel();
  if (!hotel) return;

  state.events.forEach((eventItem) => {
    const availability = getEventAvailability(hotel, eventItem);
    const frequencyLabel = formatFrequencyLabel(availability.frequency);

    const button = document.createElement("button");
    button.dataset.eventId = eventItem.id;
    if (eventItem.points < 0) {
      button.classList.add("danger");
    }
    if (!availability.available) {
      button.disabled = true;
      button.classList.add("is-locked");
      button.title = availability.reason;
    }

    const label = document.createElement("span");
    label.className = "event-button-label";
    label.textContent = `${eventItem.points >= 0 ? "+" : ""}${eventItem.points} ${eventItem.label}`;

    const meta = document.createElement("span");
    meta.className = "event-button-meta";
    meta.textContent = availability.available
      ? frequencyLabel
      : `${frequencyLabel} · ${availability.reason}`;

    button.append(label, meta);

    button.addEventListener("click", async () => {
      try {
        await logEvent(eventItem.id);
        render();
      } catch (error) {
        window.alert(error.message);
      }
    });
    eventButtonsEl.appendChild(button);
  });
}

function renderCyberIndex(hotel) {
  const cyberIndex = hotel.cyberIndex || null;
  const availability = getCyberIndexAvailability(hotel);
  const currentGrade = cyberIndex?.grade || null;

  cyberGradeEl.textContent = currentGrade || "—";
  cyberGradeEl.className = "cyber-grade";
  if (currentGrade) {
    cyberGradeEl.classList.add(`grade-${currentGrade.toLowerCase()}`);
  }

  if (!currentGrade) {
    cyberPointsEl.textContent = "Not assessed";
  } else {
    const points = cyberIndex.pointsApplied ?? CYBER_INDEX_POINTS[currentGrade];
    cyberPointsEl.textContent = `${formatPoints(points)} reputation points · assessed ${formatTime(cyberIndex.lastAssessedAt)}`;
  }

  if (!cyberIndex?.lastAssessedAt) {
    cyberRefreshEl.textContent = "Set initial grade below. Refreshes every 6 months.";
  } else if (availability.available) {
    cyberRefreshEl.textContent = "Refresh available — select a new grade below.";
  } else {
    cyberRefreshEl.textContent = availability.reason;
  }

  cyberGradeButtonsEl.innerHTML = "";
  CYBER_INDEX_GRADES.forEach((grade) => {
    const points = CYBER_INDEX_POINTS[grade];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cyber-grade-btn grade-${grade.toLowerCase()}`;
    if (currentGrade === grade) {
      button.classList.add("is-current");
    }
    button.textContent = grade;
    button.title = `${grade}: ${formatPoints(points)} points`;
    button.disabled = !availability.available;

    button.addEventListener("click", async () => {
      try {
        await setCyberIndex(grade);
        render();
      } catch (error) {
        window.alert(error.message);
      }
    });
    cyberGradeButtonsEl.appendChild(button);
  });
}

function renderTimeline() {
  timelineEl.innerHTML = "";
  const hotel = getActiveHotel();
  if (!hotel) return;

  const entries = [...hotel.timeline].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  entries.forEach((eventItem) => {
    const eventNode = timelineTemplate.content.cloneNode(true);
    const nameEl = eventNode.querySelector(".event-name");
    const pointsEl = eventNode.querySelector(".event-points");
    const descriptionEl = eventNode.querySelector(".event-description");
    const timeEl = eventNode.querySelector(".event-time");

    nameEl.textContent = eventItem.label;
    pointsEl.textContent = formatPoints(eventItem.points);
    pointsEl.classList.add(eventItem.points >= 0 ? "good" : "bad");
    descriptionEl.textContent = eventItem.description;
    timeEl.textContent = formatTime(eventItem.createdAt);

    timelineEl.appendChild(eventNode);
  });
}

function render() {
  const hotel = getActiveHotel();
  if (!hotel) return;

  hotelNameEl.textContent = hotel.name;
  scoreValueEl.textContent = hotel.score;
  const normalized = Math.max(0, Math.min(100, 50 + hotel.score / 3));
  scoreMeterEl.style.width = `${normalized}%`;

  const tier = hotel.tier || { label: "Level 1 Adventurer Inn", mood: "Neutral standing" };
  scoreStatusEl.textContent = tier.mood;
  levelEl.textContent = tier.label;

  renderStats(hotel);
  renderCyberIndex(hotel);
  renderEventButtons();
  renderTimeline();
}

async function bootstrap() {
  try {
    const store = await fetchStore();
    state.hotels = store.hotels || [];
    state.events = store.events || [];
    state.activeHotelId = state.hotels[0]?.id || "";

    renderHotelSelector();
    renderEventButtons();
    render();

    hotelSelectEl.addEventListener("change", () => {
      state.activeHotelId = hotelSelectEl.value;
      render();
    });

    demoToggleEl.addEventListener("click", () => {
      setDemoEnabled(!demo.enabled);
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      setDemoEnabled(true);
    }
  } catch (error) {
    window.alert(error.message);
  }
}

bootstrap();
