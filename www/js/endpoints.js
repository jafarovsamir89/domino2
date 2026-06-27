const DOMINO_ENDPOINTS = globalThis.DOMINO_ENDPOINTS || {
    API_BASE: "https://apid.simplesoft.az/api",
    GAME_HTTP_BASE: "https://gamed.simplesoft.az",
    GAME_WS_URL: "wss://gamed.simplesoft.az"
};

if (!globalThis.DOMINO_ENDPOINTS) {
    globalThis.DOMINO_ENDPOINTS = DOMINO_ENDPOINTS;
}
