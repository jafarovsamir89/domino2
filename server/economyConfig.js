const DEFAULT_PLATFORM_API_URL = "http://localhost:3001";

function normalizePlatformApiUrl(value) {
    return String(value || DEFAULT_PLATFORM_API_URL).replace(/\/$/, "");
}

function buildEconomyUrl(baseUrl, path) {
    return `${normalizePlatformApiUrl(baseUrl)}${path}`;
}

module.exports = {
    DEFAULT_PLATFORM_API_URL,
    normalizePlatformApiUrl,
    buildEconomyUrl
};
