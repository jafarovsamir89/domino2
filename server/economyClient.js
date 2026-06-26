const { buildEconomyUrl } = require("./economyConfig");

async function postEconomyRequest({ baseUrl, path, body, authToken, fetchImpl = fetch } = {}) {
    return fetchImpl(buildEconomyUrl(baseUrl, path), {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(body)
    });
}

async function postReserveEconomyMatch({ baseUrl, body, authToken, fetchImpl = fetch } = {}) {
    return postEconomyRequest({ baseUrl, path: "/api/economy/matches/reserve", body, authToken, fetchImpl });
}

async function postSettleEconomyMatch({ baseUrl, body, authToken, fetchImpl = fetch } = {}) {
    return postEconomyRequest({ baseUrl, path: "/api/economy/matches/settle", body, authToken, fetchImpl });
}

module.exports = {
    postEconomyRequest,
    postReserveEconomyMatch,
    postSettleEconomyMatch
};
