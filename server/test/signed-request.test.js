const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DOMINO_SERVER_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";

const { verifyDominoPayload } = require("../dominoProof");
const { buildSignedRequestBody } = require("../signedRequest");

test("buildSignedRequestBody adds integrityScope and proof without mutating payload", () => {
    const payload = {
        roomId: "room-1",
        matchId: "match-1",
        nested: { value: 3 }
    };

    const original = structuredClone(payload);
    const body = buildSignedRequestBody("economy.reserve", payload);

    assert.equal(body.integrityScope, "economy.reserve");
    assert.equal(typeof body.proof, "string");
    assert.equal(verifyDominoPayload({
        roomId: "room-1",
        matchId: "match-1",
        nested: { value: 3 },
        integrityScope: "economy.reserve"
    }, body.proof), true);
    assert.deepEqual(payload, original);
    assert.equal(payload.proof, undefined);
    assert.equal(payload.integrityScope, undefined);
});
