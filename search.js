function scoreMatch(query, text) {
    query = query.toLowerCase();
    text = text.toLowerCase();

    let score = 0;

    // exact phrase boost
    if (text.includes(query)) score += 5;

    const qWords = query.split(/\s+/);
    const tWords = text.split(/\s+/);

    qWords.forEach(q => {
        tWords.forEach(t => {
            if (t.includes(q)) score += 1;
        });
    });

    return score;
}

function semanticSearch(query, messages) {

    let results = messages
        .map(msg => ({
            ...msg,
            score: scoreMatch(query, msg.text)
        }))
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    // fallback if nothing found
    if (results.length === 0) {
        results = messages.slice(0, 5);
    }

    return results;
}