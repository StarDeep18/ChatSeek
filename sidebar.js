let messages = [];
const THEME_STORAGE_KEY = "chatseek-theme-mode";
const THEME_MODES = ["auto", "light", "dark"];
let currentThemeMode = localStorage.getItem(THEME_STORAGE_KEY) || "auto";
const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");

window.parent.postMessage({
    type: "GET_MESSAGES"
}, "*");

window.addEventListener("message", (event) => {
    if (event.data.type === "MESSAGES") {
        messages = event.data.messages;
        if (!input.value.trim()) {
            renderEmptyState("Start typing to search this conversation.");
        }
    }
});

const input = document.getElementById("search");
const results = document.getElementById("results");
const resultCount = document.getElementById("result-count");
const themeToggle = document.getElementById("theme-toggle");

function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === "auto") {
        root.removeAttribute("data-theme");
    } else {
        root.dataset.theme = mode;
    }
    themeToggle.textContent = mode[0].toUpperCase() + mode.slice(1);
}

function setThemeMode(mode) {
    currentThemeMode = mode;
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    applyTheme(mode);
}

function cycleThemeMode() {
    const currentIndex = THEME_MODES.indexOf(currentThemeMode);
    const nextMode = THEME_MODES[(currentIndex + 1) % THEME_MODES.length];
    setThemeMode(nextMode);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderEmptyState(text) {
    results.innerHTML = `<div class="empty-state">${text}</div>`;
}

function updateResultCount(count) {
    resultCount.textContent = count > 0 ? String(count) : "";
}

input.addEventListener("input", () => {
    const query = input.value.trim();

    if (!query) {
        updateResultCount(0);
        renderEmptyState("Start typing to search this conversation.");
        return;
    }

    const found = semanticSearch(query, messages);
    updateResultCount(found.length);

    if (found.length === 0) {
        renderEmptyState("No results found. Try a different keyword.");
        return;
    }

    results.innerHTML = found.map(r => `
        <div class="result" data-id="${r.id}">
            ${escapeHtml(r.text.slice(0, 120))}${r.text.length > 120 ? "..." : ""}
        </div>
    `).join("");
});

renderEmptyState("Loading conversation messages...");

applyTheme(currentThemeMode);
themeToggle.addEventListener("click", cycleThemeMode);
themeMedia.addEventListener("change", () => {
    if (currentThemeMode === "auto") {
        applyTheme("auto");
    }
});

results.addEventListener("click", (e) => {
    const target = e.target.closest(".result");
    if (!target) return;

    const id = target.dataset.id;

    window.parent.postMessage({
        type: "SCROLL_TO",
        id
    }, "*");
});