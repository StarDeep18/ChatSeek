let sidebarOpen = false;

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "F") {
        toggleSidebar();
    }
});

function toggleSidebar() {
    let existing = document.getElementById("chatseek-sidebar");

    if (existing) {
        existing.remove();
        sidebarOpen = false;
        return;
    }

    sidebarOpen = true;

    const iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("sidebar.html");
    iframe.id = "chatseek-sidebar";

    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.right = "0";
    iframe.style.width = "350px";
    iframe.style.height = "100%";
    iframe.style.zIndex = "999999";
    iframe.style.border = "none";
    iframe.style.background = "white";
    iframe.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";

    document.body.appendChild(iframe);
}

window.addEventListener("message", async (event) => {

    if (event.data.type === "GET_MESSAGES") {
        const messages = await extractMessages();

        const iframe = document.getElementById("chatseek-sidebar");

        iframe.contentWindow.postMessage({
            type: "MESSAGES",
            messages
        }, "*");
    }

    if (event.data.type === "SCROLL_TO") {
        const el = document.querySelector(`[data-chatseek-id="${event.data.id}"]`);

        if (el) {
            el.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            el.style.background = "rgba(255,255,0,0.3)";
            setTimeout(() => el.style.background = "", 1500);
        }
    }
});

async function loadFullChat() {
    let prevHeight = 0;

    while (true) {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 700));

        let newHeight = document.body.scrollHeight;

        if (newHeight === prevHeight) break;
        prevHeight = newHeight;
    }
}

async function extractMessages() {
    await loadFullChat();

    const nodes = document.querySelectorAll("[data-message-author-role]");
    const messages = [];

    nodes.forEach((node, i) => {
        node.setAttribute("data-chatseek-id", i);
        const text = node.innerText.slice(0, 300);
        const lowerText = text.toLowerCase();

        messages.push({
            id: i,
            text,
            lowerText,
            tokens: lowerText.split(/\s+/).filter(Boolean),
            embedding: null
        });
    });

    return messages;
}