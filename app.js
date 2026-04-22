const state = {
  hotels: [],
  events: [],
  activeHotelId: "",
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

async function fetchStore() {
  const response = await fetch("/api/store");
  if (!response.ok) throw new Error("Unable to load dashboard data.");
  return response.json();
}

async function logEvent(eventId) {
  const response = await fetch("/api/log-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hotelId: state.activeHotelId,
      eventId,
    }),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "Failed to log event.");
  }

  const payload = await response.json();
  state.hotels = state.hotels.map((hotel) =>
    hotel.id === payload.hotel.id ? payload.hotel : hotel
  );
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
  state.events.forEach((eventItem) => {
    const button = document.createElement("button");
    button.dataset.eventId = eventItem.id;
    button.textContent = `${eventItem.points >= 0 ? "+" : ""}${eventItem.points} ${eventItem.label}`;
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

function renderTimeline() {
  timelineEl.innerHTML = "";
  const hotel = getActiveHotel();
  if (!hotel) return;

  hotel.timeline.forEach((eventItem) => {
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
  } catch (error) {
    window.alert(error.message);
  }
}

bootstrap();
