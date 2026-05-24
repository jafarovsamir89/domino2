const DEFAULT_PLATFORM_API_URL = "http://localhost:3000";

function normalizePlatformApiUrl(value) {
    return String(value || DEFAULT_PLATFORM_API_URL).replace(/\/$/, "");
}

function resolvePlatformApiUrl(value = process.env.PLATFORM_API_URL) {
    return normalizePlatformApiUrl(value);
}

function buildEconomyUrl(baseUrl, path) {
    return `${normalizePlatformApiUrl(baseUrl)}${path}`;
}

async function probePlatformApiUrl(baseUrl = resolvePlatformApiUrl(), fetchImpl = fetch) {
    const resolvedBaseUrl = resolvePlatformApiUrl(baseUrl);

    try {
        const response = await fetchImpl(`${resolvedBaseUrl}/api/health`, {
            method: "GET",
            headers: {
                accept: "application/json"
            }
        });
        const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase();
        const text = await response.text().catch(() => "");
        const preview = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
        const isHtml = contentType.includes("text/html") || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
        if (!response.ok || !contentType.includes("application/json")) {
            return {
                ok: false,
                url: resolvedBaseUrl,
                status: response.status,
                contentType,
                preview,
                reason: isHtml ? "html" : "non_json"
            };
        }
        return {
            ok: true,
            url: resolvedBaseUrl,
            status: response.status,
            contentType
        };
    } catch (error) {
        return {
            ok: false,
            url: resolvedBaseUrl,
            reason: "network_error",
            error: error?.message || String(error || "probe_failed")
        };
    }
}

module.exports = {
    DEFAULT_PLATFORM_API_URL,
    normalizePlatformApiUrl,
    resolvePlatformApiUrl,
    buildEconomyUrl,
    probePlatformApiUrl
};
