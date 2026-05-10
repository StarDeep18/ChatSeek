let sidebarOpen = false;
let hasLoadedFullChat = false;
let indexedMessages = [];
let indexedNodeCount = 0;
let activeChatId = "";
let activeChatTitle = "";
let pendingJumpHandled = false;
const MAX_TEXT_LENGTH = 300;
const STORAGE_KEYS = {
    chatIndex: "chatseek:chatIndex:v1",
    pendingJump: "chatseek:pendingJump:v1"
};
const INDEX_LIMITS = {
    maxChats: 60,
    maxMessagesPerChat: 800
};

function isExtensionContextAvailable() {
    try {
        return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
    } catch (err) {
        return false;
    }
}

document.addEventListener("keydown", (e) => {
    if (!isExtensionContextAvailable()) return;
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

    if (!isExtensionContextAvailable() || typeof chrome.runtime.getURL !== "function") {
        sidebarOpen = false;
        console.warn("[ChatSeek] Extension runtime unavailable. Reload the page after reloading the extension.");
        return;
    }

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
    if (!isExtensionContextAvailable()) return;

    if (event.data.type === "GET_MESSAGES") {
        const { messages, chatContext } = await extractMessagesIncremental();

        const iframe = document.getElementById("chatseek-sidebar");
        if (!iframe?.contentWindow) return;

        iframe.contentWindow.postMessage({
            type: "MESSAGES",
            messages,
            chatContext
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

function getChatIdFromUrl() {
    const path = window.location.pathname || "/";
    const segments = path.split("/").filter(Boolean);
    const cIndex = segments.indexOf("c");
    if (cIndex !== -1 && segments[cIndex + 1]) {
        return segments[cIndex + 1];
    }
    return path || "home";
}

function getChatTitle() {
    const rawTitle = (document.title || "").replace(/\s*-\s*ChatGPT\s*$/i, "").trim();
    return rawTitle || "Untitled Chat";
}

function getChatContext() {
    return {
        chatId: getChatIdFromUrl(),
        title: getChatTitle(),
        url: window.location.href
    };
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
        timestamp: Date.now(),
        embedding: null
    };
}

async function readChatIndex() {
    if (!isExtensionContextAvailable() || !chrome?.storage?.local) return {};
    try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.chatIndex);
        const records = data[STORAGE_KEYS.chatIndex];
        return records && typeof records === "object" ? records : {};
    } catch (err) {
        return {};
    }
}

function pruneChatIndex(records) {
    const entries = Object.entries(records).sort((a, b) => {
        const aUpdated = a[1]?.lastUpdated || 0;
        const bUpdated = b[1]?.lastUpdated || 0;
        return bUpdated - aUpdated;
    });

    const keptEntries = entries.slice(0, INDEX_LIMITS.maxChats).map(([chatId, record]) => {
        const messages = Array.isArray(record.messages) ? record.messages : [];
        const trimmedMessages = messages.slice(-INDEX_LIMITS.maxMessagesPerChat);
        return [chatId, { ...record, messages: trimmedMessages }];
    });

    return Object.fromEntries(keptEntries);
}

async function writeChatIndex(records) {
    if (!isExtensionContextAvailable() || !chrome?.storage?.local) return;
    try {
        const compact = pruneChatIndex(records);
        await chrome.storage.local.set({ [STORAGE_KEYS.chatIndex]: compact });
    } catch (err) {
        // Ignore storage errors to keep search functional.
    }
}

function applyNodeIds(nodes) {
    nodes.forEach((node, index) => {
        node.setAttribute("data-chatseek-id", index);
    });
}

function needsFullRebuild(existingMessages, nodes) {
    if (!Array.isArray(existingMessages)) return true;
    if (existingMessages.length > nodes.length) return true;
    if (existingMessages.length === 0) return false;

    const lastIndexed = existingMessages[existingMessages.length - 1];
    const correspondingNode = nodes[existingMessages.length - 1];
    if (!lastIndexed || !correspondingNode) return false;

    const nodeText = correspondingNode.innerText.slice(0, MAX_TEXT_LENGTH);
    return lastIndexed.text !== nodeText;
}

async function maybeHandlePendingJump() {
    if (pendingJumpHandled || !isExtensionContextAvailable() || !chrome?.storage?.local) return;
    pendingJumpHandled = true;

    try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.pendingJump);
        const pending = data[STORAGE_KEYS.pendingJump];
        const chatId = getChatIdFromUrl();
        if (!pending || pending.chatId !== chatId) return;

        const target = document.querySelector(`[data-chatseek-id="${pending.messageId}"]`);
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.style.background = "rgba(255,255,0,0.3)";
            setTimeout(() => {
                target.style.background = "";
            }, 1700);
        }

        await chrome.storage.local.remove(STORAGE_KEYS.pendingJump);
    } catch (err) {
        // Non-blocking.
    }
}

async function ensureIndexedMessages() {
    if (!isExtensionContextAvailable()) {
        indexedMessages = [];
        indexedNodeCount = 0;
        return;
    }
    const chatContext = getChatContext();
    const chatId = chatContext.chatId;
    activeChatTitle = chatContext.title;
    const nodes = Array.from(document.querySelectorAll("[data-message-author-role]"));

    if (!hasLoadedFullChat) {
        await loadFullChat();
        hasLoadedFullChat = true;
    }

    const freshNodes = Array.from(document.querySelectorAll("[data-message-author-role]"));
    applyNodeIds(freshNodes);
    const index = await readChatIndex();
    const existingRecord = index[chatId];

    if (activeChatId !== chatId) {
        activeChatId = chatId;
        indexedMessages = Array.isArray(existingRecord?.messages) ? existingRecord.messages : [];
        indexedNodeCount = indexedMessages.length;
    }

    if (needsFullRebuild(indexedMessages, freshNodes)) {
        indexedMessages = [];
        indexedNodeCount = 0;
    }

    for (let i = indexedNodeCount; i < freshNodes.length; i += 1) {
        const node = freshNodes[i];
        indexedMessages.push(toIndexedMessage(node, i));
    }

    indexedNodeCount = freshNodes.length;
    index[chatId] = {
        chatId,
        title: activeChatTitle,
        url: chatContext.url,
        lastUpdated: Date.now(),
        lastIndexedAt: Date.now(),
        messages: indexedMessages
    };
    await writeChatIndex(index);
    await maybeHandlePendingJump();
}

async function extractMessagesIncremental() {
    await ensureIndexedMessages();
    return {
        messages: indexedMessages,
        chatContext: getChatContext()
    };
}