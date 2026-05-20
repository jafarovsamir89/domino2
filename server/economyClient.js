const { buildEconomyUrl } = require("./economyConfig");

async function postEconomyRequest({ baseUrl, path, body, fetchImpl = fetch } = {}) {
    return fetchImpl(buildEconomyUrl(baseUrl, path), {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(body)
    });
}

module.exports = {
    postEconomyRequest
};
