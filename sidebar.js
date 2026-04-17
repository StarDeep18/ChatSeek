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

let timeout;

input.addEventListener("input", () => {
    const query = input.value.trim();

    if (!query) {
        results.innerHTML = "";
        return;
    }

    const found = semanticSearch(query, messages);

    results.innerHTML = found.map(r => `
        <div class="result" data-id="${r.id}">
            ${r.text.slice(0,120)}...
        </div>
    `).join("");
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