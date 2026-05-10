let messages = [];
const THEME_STORAGE_KEY = "chatseek-theme-mode";
const THEME_MODES = ["auto", "light", "dark"];
let currentThemeMode = localStorage.getItem(THEME_STORAGE_KEY) || "auto";
const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
const SEARCH_UI_CONFIG = {
    initialRenderCount: 20,
    renderBatchCount: 20
};
let activeResultIndex = -1;
let currentResults = [];
let latestQuery = "";
let searchToken = 0;
let debounceTimer = null;
let renderedCount = 0;

window.parent.postMessage({
    type: "GET_MESSAGES"
}, "*");

window.addEventListener("message", (event) => {
    if (event.data.type === "MESSAGES") {
        messages = event.data.messages;
        if (!input.value.trim()) {
            renderEmptyState("Start typing to search this conversation.");
        } else {
            scheduleSearch();
        }
    }
});

const input = document.getElementById("search");
const results = document.getElementById("results");
const resultCount = document.getElementById("result-count");
const themeToggle = document.getElementById("theme-toggle");
const scopeFilter = document.getElementById("scope-filter");
const authorFilter = document.getElementById("author-filter");

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

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, query) {
    const words = query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    if (words.length === 0) return escapeHtml(text);

    const pattern = words.map(escapeRegex).join("|");
    const regex = new RegExp(`(${pattern})`, "gi");
    return escapeHtml(text).replace(regex, "<mark class=\"highlight\">$1</mark>");
}

function renderEmptyState(text) {
    results.innerHTML = `<div class="empty-state">${text}</div>`;
    activeResultIndex = -1;
}

function updateResultCount(count) {
    resultCount.textContent = count > 0 ? String(count) : "";
}

function getSearchOptions() {
    return {
        scope: scopeFilter.value,
        author: authorFilter.value
    };
}

function renderResultBatch(start, end) {
    const batch = currentResults.slice(start, end);
    const html = batch.map((r, idx) => {
        const absoluteIdx = start + idx;
        return `
        <div class="result ${absoluteIdx === activeResultIndex ? "active" : ""}" data-index="${absoluteIdx}" data-id="${r.id}">
            <div class="result-snippet">${highlightText(r.snippet || r.text, latestQuery)}</div>
            <div class="result-meta">${escapeHtml(r.author || "unknown")} · score ${Math.round((r.score || 0) * 10) / 10}</div>
        </div>
    `;
    }).join("");

    results.insertAdjacentHTML("beforeend", html);
    renderedCount = end;
}

function renderResultsList(found, query) {
    currentResults = found;
    latestQuery = query;
    activeResultIndex = found.length > 0 ? 0 : -1;
    results.innerHTML = "";

    if (found.length === 0) {
        renderEmptyState("No results found. Try a different keyword.");
        return;
    }

    const firstChunk = Math.min(found.length, SEARCH_UI_CONFIG.initialRenderCount);
    renderResultBatch(0, firstChunk);
    updateActiveResult();
}

function runSearch() {
    const query = input.value.trim();
    if (!query) {
        updateResultCount(0);
        renderEmptyState("Start typing to search this conversation.");
        return;
    }

    const found = semanticSearch(query, messages, getSearchOptions());
    updateResultCount(found.length);
    renderResultsList(found, query);
}

function scheduleSearch() {
    searchToken += 1;
    const tokenAtSchedule = searchToken;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        if (tokenAtSchedule !== searchToken) return;
        runSearch();
    }, SEARCH_CONFIG.debounceMs || 100);
}

function updateActiveResult() {
    const cards = results.querySelectorAll(".result");
    cards.forEach((card) => {
        const cardIndex = Number(card.dataset.index || -1);
        card.classList.toggle("active", cardIndex === activeResultIndex);
    });

    const activeCard = results.querySelector(`.result[data-index="${activeResultIndex}"]`);
    if (activeCard) {
        activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
}

function openActiveResult() {
    const target = currentResults[activeResultIndex];
    if (!target) return;
    window.parent.postMessage({
        type: "SCROLL_TO",
        id: target.id
    }, "*");
}

renderEmptyState("Loading conversation messages...");

applyTheme(currentThemeMode);
themeToggle.addEventListener("click", cycleThemeMode);
themeMedia.addEventListener("change", () => {
    if (currentThemeMode === "auto") {
        applyTheme("auto");
    }
});

input.addEventListener("input", scheduleSearch);
scopeFilter.addEventListener("change", scheduleSearch);
authorFilter.addEventListener("change", scheduleSearch);

input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
        event.preventDefault();
        if (currentResults.length === 0) return;
        activeResultIndex = Math.min(currentResults.length - 1, activeResultIndex + 1);
        updateActiveResult();
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (currentResults.length === 0) return;
        activeResultIndex = Math.max(0, activeResultIndex - 1);
        updateActiveResult();
    } else if (event.key === "Enter") {
        event.preventDefault();
        openActiveResult();
    } else if (event.key === "Escape") {
        input.value = "";
        currentResults = [];
        updateResultCount(0);
        renderEmptyState("Start typing to search this conversation.");
    }
});

results.addEventListener("scroll", () => {
    const nearBottom = results.scrollTop + results.clientHeight >= results.scrollHeight - 80;
    if (!nearBottom || renderedCount >= currentResults.length) return;
    const nextEnd = Math.min(currentResults.length, renderedCount + SEARCH_UI_CONFIG.renderBatchCount);
    renderResultBatch(renderedCount, nextEnd);
    updateActiveResult();
});

results.addEventListener("click", (e) => {
    const target = e.target.closest(".result");
    if (!target) return;
    activeResultIndex = Number(target.dataset.index || 0);
    updateActiveResult();
    openActiveResult();
});