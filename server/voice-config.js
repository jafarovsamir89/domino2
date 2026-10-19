function parseJsonIceServers(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        return entries.map((entry) => {
            const rawUrls = typeof entry === "string" ? entry : entry?.urls;
            const urls = (Array.isArray(rawUrls) ? rawUrls : [rawUrls])
                .map((url) => String(url || "").trim())
                .filter((url) => /^(stun|stuns|turn|turns):/i.test(url));
            return {
                urls,
                username: typeof entry === "object" && entry?.username ? String(entry.username).trim() : undefined,
                credential: typeof entry === "object" && entry?.credential ? String(entry.credential).trim() : undefined
            };
        }).filter((entry) => entry.urls.length > 0);
    } catch (err) {
        console.warn("[Voice] Invalid VOICE_ICE_SERVERS_JSON:", err.message);
        return [];
    }
}

function buildVoiceConfig(env = process.env) {
    const defaultIceServers = [
        { urls: "stun:stun.l.google.com:19302" }
    ];
    const servers = [...defaultIceServers, ...parseJsonIceServers(env.VOICE_ICE_SERVERS_JSON || "")];
    const turnUrls = String(env.VOICE_TURN_URLS || env.TURN_URLS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const turnUsername = String(env.VOICE_TURN_USERNAME || env.TURN_USERNAME || "").trim();
    const turnCredential = String(env.VOICE_TURN_CREDENTIAL || env.TURN_CREDENTIAL || "").trim();

    if (turnUrls.length > 0) {
        servers.push({
            urls: turnUrls,
            ...(turnUsername ? { username: turnUsername } : {}),
            ...(turnCredential ? { credential: turnCredential } : {})
        });
    }

    const deduped = [];
    const seen = new Set();
    for (const server of servers) {
        const rawUrls = Array.isArray(server.urls) ? server.urls : [server.urls];
        const urls = rawUrls.map((url) => String(url || "").trim()).filter((url) => /^(stun|stuns|turn|turns):/i.test(url));
        if (!urls.length) continue;
        const key = JSON.stringify({
            urls,
            username: server.username || "",
            credential: server.credential || ""
        });
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({
            urls,
            ...(server.username ? { username: server.username } : {}),
            ...(server.credential ? { credential: server.credential } : {})
        });
    }

    return {
        iceServers: deduped,
        iceTransportPolicy: String(env.VOICE_ICE_TRANSPORT_POLICY || "").trim() || "all",
        iceCandidatePoolSize: Math.max(0, Math.min(8, Number(env.VOICE_ICE_CANDIDATE_POOL_SIZE || 2) || 2))
    };
}

module.exports = { buildVoiceConfig, parseJsonIceServers };
