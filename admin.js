const state = {
  hotels: [],
  events: [],
};

const statusEl = document.getElementById("admin-status");
const hotelListEl = document.getElementById("hotel-list");
const eventListEl = document.getElementById("event-list");

const hotelNameInput = document.getElementById("hotel-name-input");
const addHotelBtn = document.getElementById("add-hotel-btn");

const eventLabelInput = document.getElementById("event-label-input");
const eventDescriptionInput = document.getElementById("event-description-input");
const eventPointsInput = document.getElementById("event-points-input");
const eventCategoryInput = document.getElementById("event-category-input");
const eventFrequencyInput = document.getElementById("event-frequency-input");
const addEventBtn = document.getElementById("add-event-btn");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ff6b6b" : "#71a8ff";
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(payload.error || "Request failed.");
  }
  return response.json();
}

async function loadStore() {
  const store = await api("/api/store");
  state.hotels = store.hotels || [];
  state.events = store.events || [];
}

async function createHotel() {
  const name = hotelNameInput.value.trim();
  if (!name) throw new Error("Hotel name is required.");

  await api("/api/hotels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  hotelNameInput.value = "";
}

async function createEvent() {
  const label = eventLabelInput.value.trim();
  const description = eventDescriptionInput.value.trim();
  const points = Number(eventPointsInput.value);
  const category = eventCategoryInput.value.trim() || "custom";
  const frequency = eventFrequencyInput.value || "repeatable";

  if (!label || !description || Number.isNaN(points)) {
    throw new Error("Event label, description, and numeric points are required.");
  }

  await api("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, description, points, category, frequency }),
  });

  eventLabelInput.value = "";
  eventDescriptionInput.value = "";
  eventPointsInput.value = "";
  eventCategoryInput.value = "";
  eventFrequencyInput.value = "repeatable";
}

async function deleteHotel(hotelId) {
  await api(`/api/hotels/${encodeURIComponent(hotelId)}`, { method: "DELETE" });
}

async function deleteEvent(eventId) {
  await api(`/api/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

async function updateEventPoints(eventId, points) {
  await api(`/api/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points }),
  });
}

function formatFrequencyLabel(frequency) {
  if (frequency === "once") return "One-time";
  if (frequency === "yearly") return "Yearly";
  return "Repeatable";
}

function renderHotels() {
  hotelListEl.innerHTML = "";
  state.hotels.forEach((hotel) => {
    const li = document.createElement("li");
    li.className = "timeline-item";
    li.innerHTML = `
      <div class="event-row">
        <span>${hotel.name}</span>
        <button class="danger">Remove</button>
      </div>
      <p class="event-description">Current score: ${hotel.score}</p>
    `;
    li.querySelector("button").addEventListener("click", async () => {
      try {
        await deleteHotel(hotel.id);
        await refresh();
        setStatus(`Hotel "${hotel.name}" removed.`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });
    hotelListEl.appendChild(li);
  });
}

function renderEvents() {
  eventListEl.innerHTML = "";
  state.events.forEach((eventItem) => {
    const li = document.createElement("li");
    li.className = "timeline-item";
    li.innerHTML = `
      <div class="event-row">
        <span>${eventItem.label}</span>
        <span class="${eventItem.points >= 0 ? "event-points good" : "event-points bad"}">
          ${eventItem.points >= 0 ? "+" : ""}${eventItem.points}
        </span>
      </div>
      <p class="event-description">${eventItem.description}</p>
      <div class="event-row">
        <small class="event-time">Category: ${eventItem.category} · ${formatFrequencyLabel(eventItem.frequency)}</small>
        <div class="event-admin-actions">
          <input
            type="number"
            class="inline-points-input"
            value="${eventItem.points}"
            aria-label="Edit ${eventItem.label} points"
          />
          <button class="save-points-btn">Save points</button>
          <button class="danger remove-event-btn">Remove</button>
        </div>
      </div>
    `;
    li.querySelector(".remove-event-btn").addEventListener("click", async () => {
      try {
        await deleteEvent(eventItem.id);
        await refresh();
        setStatus(`Event "${eventItem.label}" removed.`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    li.querySelector(".save-points-btn").addEventListener("click", async () => {
      try {
        const pointsInputEl = li.querySelector(".inline-points-input");
        const nextPoints = Number(pointsInputEl.value);
        if (Number.isNaN(nextPoints)) {
          throw new Error("Points must be numeric.");
        }

        await updateEventPoints(eventItem.id, nextPoints);
        await refresh();
        setStatus(`Points updated for "${eventItem.label}". Historical data recalculated.`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    eventListEl.appendChild(li);
  });
}

function render() {
  renderHotels();
  renderEvents();
}

async function refresh() {
  await loadStore();
  render();
}

addHotelBtn.addEventListener("click", async () => {
  try {
    await createHotel();
    await refresh();
    setStatus("Hotel created.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

addEventBtn.addEventListener("click", async () => {
  try {
    await createEvent();
    await refresh();
    setStatus("Event type created.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

refresh()
  .then(() => setStatus("Loaded current data."))
  .catch((error) => setStatus(error.message, true));
