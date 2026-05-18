const crypto = require("crypto");

function getSecret() {
    const secret = process.env.DOMINO_SERVER_SECRET || process.env.BETTER_AUTH_SECRET || "";
    if (!secret || ["change-me", "replace-me", "secret", "test"].includes(secret.trim())) {
        throw new Error(
            "DOMINO_SERVER_SECRET or BETTER_AUTH_SECRET environment variable is required for signed server requests"
        );
    }
    return secret;
}

function normalizeValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeValue(item));
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (value && typeof value === "object") {
        return Object.keys(value)
            .sort()
            .reduce((acc, key) => {
                acc[key] = normalizeValue(value[key]);
                return acc;
            }, {});
    }

    if (typeof value === "bigint") {
        return value.toString();
    }

    return value;
}

function stableStringify(value) {
    return JSON.stringify(normalizeValue(value));
}

function signDominoPayload(payload) {
    return crypto.createHmac("sha256", getSecret()).update(stableStringify(payload)).digest("base64url");
}

function verifyDominoPayload(payload, proof) {
    const signature = String(proof || "").trim();
    if (!signature) return false;

    const expected = signDominoPayload(payload);
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length) {
        return false;
    }
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

module.exports = {
    signDominoPayload,
    verifyDominoPayload
};
