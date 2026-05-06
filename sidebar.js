let messages = [];

window.parent.postMessage({
    type: "GET_MESSAGES"
}, "*");

window.addEventListener("message", (event) => {
    if (event.data.type === "MESSAGES") {
    messages = event.data.messages;

}
});

const input = document.getElementById("search");
const results = document.getElementById("results");
const resultCount = document.getElementById("result-count");

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

results.addEventListener("click", (e) => {
    const target = e.target.closest(".result");
    if (!target) return;

    const id = target.dataset.id;

    window.parent.postMessage({
        type: "SCROLL_TO",
        id
    }, "*");
});