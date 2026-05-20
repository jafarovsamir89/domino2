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

async function postReserveEconomyMatch({ baseUrl, body, fetchImpl = fetch } = {}) {
    return postEconomyRequest({ baseUrl, path: "/api/economy/matches/reserve", body, fetchImpl });
}

async function postSettleEconomyMatch({ baseUrl, body, fetchImpl = fetch } = {}) {
    return postEconomyRequest({ baseUrl, path: "/api/economy/matches/settle", body, fetchImpl });
}

async function postRefundEconomyMatch({ baseUrl, body, fetchImpl = fetch } = {}) {
    return postEconomyRequest({ baseUrl, path: "/api/economy/matches/refund", body, fetchImpl });
}

module.exports = {
    postEconomyRequest,
    postReserveEconomyMatch,
    postSettleEconomyMatch,
    postRefundEconomyMatch
};
