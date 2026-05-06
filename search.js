const SEARCH_CONFIG = {
    debug: false,
    minQueryLength: 2,
    recentScopeLimit: 120,
    extendedScopeLimit: 300,
    zeroCandidateFallbackLimit: 30,
    maxResults: 10,
    weights: {
        exactPhrase: 5,
        startsWith: 3,
        partialWord: 1,
        wholeWord: 1.5,
        nearbyGrouping: 2,
        recencyMax: 2,
        recencyFalloff: 40
    }
};

function nowMs() {
    if (typeof performance !== "undefined" && performance.now) {
        return performance.now();
    }
    return Date.now();
}

function debugLog(event, payload) {
    if (!SEARCH_CONFIG.debug) return;
    console.debug(`[ChatSeek][Search][${event}]`, payload);
}

function getMessageTextData(message) {
    const lowerText = (message.lowerText || message.text || "").toLowerCase();
    const tokens = Array.isArray(message.tokens) && message.tokens.length
        ? message.tokens
        : lowerText.split(/\s+/).filter(Boolean);

    return { lowerText, tokens };
}

function getWordPositions(tokens, queryWords) {
    const positions = [];

    queryWords.forEach((word) => {
        const idx = tokens.findIndex((token) => token.includes(word));
        if (idx !== -1) positions.push(idx);
    });

    return positions.sort((a, b) => a - b);
}

function scoreMatch(query, message, recencyIndex = 0) {
    query = query.toLowerCase();
    const { lowerText, tokens } = getMessageTextData(message);
    const qWords = query.split(/\s+/).filter(Boolean);
    const { weights } = SEARCH_CONFIG;

    let score = 0;

    // exact phrase boost
    if (lowerText.includes(query)) score += weights.exactPhrase;

    // starts-with boost for stronger intent matches
    if (lowerText.startsWith(query)) score += weights.startsWith;

    qWords.forEach(q => {
        tokens.forEach(t => {
            // preserve partial scoring behavior
            if (t.includes(q)) score += weights.partialWord;
            // extra whole-word precision boost
            if (t === q) score += weights.wholeWord;
        });
    });

    // grouping boost when matched words appear close together
    if (qWords.length > 1) {
        const positions = getWordPositions(tokens, qWords);
        if (positions.length > 1) {
            const spread = positions[positions.length - 1] - positions[0];
            if (spread <= qWords.length + 1) score += weights.nearbyGrouping;
        }
    }

    // recency bonus to keep recent messages feeling responsive
    score += Math.max(0, weights.recencyMax - recencyIndex / weights.recencyFalloff);

    return score;
}

function getSearchScope(messages, limit) {
    if (messages.length <= limit) return messages;
    return messages.slice(messages.length - limit);
}

function preFilterCandidates(query, queryWords, sourceMessages) {
    const isShortQuery = query.length < 3;

    return sourceMessages.filter((message) => {
        const lowerText = (message.lowerText || message.text || "").toLowerCase();
        if (lowerText.includes(query)) return true;

        return queryWords.some((word) => {
            // For short queries, prefer token prefix/whole-word style matching
            // to reduce broad noise from trivial substrings.
            if (isShortQuery) {
                const { tokens } = getMessageTextData(message);
                return tokens.some((token) => token.startsWith(word));
            }
            return lowerText.includes(word);
        });
    });
}

function rankMessages(query, candidates, maxResults) {
    return candidates
        .map((msg, idx) => ({
            ...msg,
            score: scoreMatch(query, msg, idx)
        }))
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
}

function semanticSearch(query, messages) {
    const searchStart = nowMs();
    const normalizedQuery = query.toLowerCase();
    if (normalizedQuery.length < SEARCH_CONFIG.minQueryLength) {
        debugLog("skip-short-query", {
            query: normalizedQuery,
            minQueryLength: SEARCH_CONFIG.minQueryLength
        });
        return [];
    }

    const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
    const recentScope = getSearchScope(messages, SEARCH_CONFIG.recentScopeLimit);

    // Stage 1: fast candidate pass on recent messages
    const stage1Start = nowMs();
    let candidates = preFilterCandidates(normalizedQuery, queryWords, recentScope);
    const stage1Ms = nowMs() - stage1Start;

    // Stage 2: broaden moderately, still not a full scan
    if (candidates.length === 0 && messages.length > recentScope.length) {
        const stage2Start = nowMs();
        const extendedScope = getSearchScope(messages, SEARCH_CONFIG.extendedScopeLimit);
        candidates = preFilterCandidates(normalizedQuery, queryWords, extendedScope);
        debugLog("stage-2-prefilter", {
            query: normalizedQuery,
            scanned: extendedScope.length,
            candidates: candidates.length,
            durationMs: +(nowMs() - stage2Start).toFixed(2)
        });
    }

    const rankStart = nowMs();
    let results = rankMessages(normalizedQuery, candidates, SEARCH_CONFIG.maxResults);
    const rankMs = nowMs() - rankStart;

    // Fallback: small recent subset for snappy UX when no matches
    if (results.length === 0) {
        const fallback = getSearchScope(messages, SEARCH_CONFIG.zeroCandidateFallbackLimit);
        results = fallback.slice().reverse().slice(0, 5).map((msg) => ({
            ...msg,
            score: 0
        }));
    }

    debugLog("search-metrics", {
        query: normalizedQuery,
        totalMessages: messages.length,
        recentScope: recentScope.length,
        stage1Candidates: candidates.length,
        stage1Ms: +stage1Ms.toFixed(2),
        rankMs: +rankMs.toFixed(2),
        resultCount: results.length,
        totalMs: +(nowMs() - searchStart).toFixed(2)
    });

    return results;
}