let sidebarOpen = false;
let hasLoadedFullChat = false;
let indexedMessages = [];
let indexedNodeCount = 0;
let activeConversationKey = "";
const MAX_TEXT_LENGTH = 300;
const CACHE_PREFIX = "chatseek-index:";

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
    iframe.style.background = "transparent";
    iframe.style.boxShadow = "0 0 24px rgba(0,0,0,0.25)";

    document.body.appendChild(iframe);
}

window.addEventListener("message", async (event) => {

    if (event.data.type === "GET_MESSAGES") {
        const messages = await extractMessagesIncremental();

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

function getConversationKey() {
    const path = window.location.pathname || "/";
    return `${CACHE_PREFIX}${path}`;
}

function toIndexedMessage(node, id) {
    const text = node.innerText.slice(0, MAX_TEXT_LENGTH);
    const lowerText = text.toLowerCase();
    return {
        id,
        text,
        lowerText,
        tokens: lowerText.split(/\s+/).filter(Boolean),
        author: node.getAttribute("data-message-author-role") || "unknown",
        embedding: null
    };
}

async function readSessionCache(key) {
    if (!chrome?.storage?.session) return null;
    try {
        const data = await chrome.storage.session.get(key);
        return data[key] || null;
    } catch (err) {
        return null;
    }
}

async function writeSessionCache(key, payload) {
    if (!chrome?.storage?.session) return;
    try {
        await chrome.storage.session.set({ [key]: payload });
    } catch (err) {
        // Ignore storage errors to keep search functional.
    }
}

async function ensureIndexedMessages() {
    const conversationKey = getConversationKey();
    const nodes = Array.from(document.querySelectorAll("[data-message-author-role]"));

    if (!hasLoadedFullChat) {
        const cached = await readSessionCache(conversationKey);
        if (cached && Array.isArray(cached.messages) && cached.nodeCount === nodes.length) {
            indexedMessages = cached.messages;
            indexedNodeCount = cached.nodeCount;
            hasLoadedFullChat = true;
            activeConversationKey = conversationKey;

            indexedMessages.forEach((message, i) => {
                const node = nodes[i];
                if (node) node.setAttribute("data-chatseek-id", message.id);
            });
            return;
        }

        await loadFullChat();
        hasLoadedFullChat = true;
    }

    const freshNodes = Array.from(document.querySelectorAll("[data-message-author-role]"));

    if (activeConversationKey !== conversationKey) {
        indexedMessages = [];
        indexedNodeCount = 0;
        activeConversationKey = conversationKey;
    }

    if (freshNodes.length < indexedNodeCount) {
        indexedMessages = [];
        indexedNodeCount = 0;
    }

    for (let i = indexedNodeCount; i < freshNodes.length; i += 1) {
        const node = freshNodes[i];
        node.setAttribute("data-chatseek-id", i);
        indexedMessages.push(toIndexedMessage(node, i));
    }

    for (let i = 0; i < indexedNodeCount && i < freshNodes.length; i += 1) {
        freshNodes[i].setAttribute("data-chatseek-id", i);
    }

    indexedNodeCount = freshNodes.length;

    await writeSessionCache(conversationKey, {
        nodeCount: indexedNodeCount,
        messages: indexedMessages
    });
}

async function extractMessagesIncremental() {
    await ensureIndexedMessages();
    return indexedMessages;
}