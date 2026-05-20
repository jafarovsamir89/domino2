const { signDominoPayload } = require("./dominoProof");

function buildSignedRequestBody(scope, payload = {}) {
    const body = {
        ...payload,
        integrityScope: scope
    };

    return {
        ...body,
        proof: signDominoPayload(body)
    };
}

module.exports = {
    buildSignedRequestBody
};
