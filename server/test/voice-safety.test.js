const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildVoiceConfig, parseJsonIceServers } = require("../voice-config");

test("voice ICE configuration accepts string and legacy URL arrays and keeps TURN credentials", () => {
    const config = buildVoiceConfig({
        VOICE_ICE_SERVERS_JSON: JSON.stringify([
            "stuns:stun.example.invalid:5349",
            { urls: ["turns:turn.example.invalid:5349", "https://invalid.example/"], username: " test-user ", credential: " test-secret " }
        ]),
        VOICE_ICE_TRANSPORT_POLICY: "relay",
        VOICE_ICE_CANDIDATE_POOL_SIZE: "4"
    });

    assert.deepEqual(config.iceServers, [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stuns:stun.example.invalid:5349"] },
        { urls: ["turns:turn.example.invalid:5349"], username: "test-user", credential: "test-secret" }
    ]);
    assert.equal(config.iceTransportPolicy, "relay");
    assert.equal(config.iceCandidatePoolSize, 4);
});

test("voice ICE configuration filters invalid URLs, deduplicates and bounds pool size", () => {
    const config = buildVoiceConfig({
        VOICE_ICE_SERVERS_JSON: JSON.stringify([
            { urls: ["https://invalid.example/", "turn:relay.example.invalid:3478"] },
            { urls: ["turn:relay.example.invalid:3478"] }
        ]),
        VOICE_ICE_CANDIDATE_POOL_SIZE: "99"
    });

    assert.deepEqual(config.iceServers, [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["turn:relay.example.invalid:3478"] }
    ]);
    assert.equal(config.iceCandidatePoolSize, 8);
    assert.deepEqual(parseJsonIceServers("not-json"), []);
});

test("voice stun config does not contain invalid transport query strings", () => {
    const files = [
        path.resolve(__dirname, "../../js/voice.js"),
        path.resolve(__dirname, "../../www/js/voice.js"),
        path.resolve(__dirname, "../../js/network.js"),
        path.resolve(__dirname, "../../www/js/network.js"),
        path.resolve(__dirname, "../../server/index.js")
    ];

    for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        assert.equal(source.includes("stun:global.stun.twilio.com:3478?transport=udp"), false, `${path.basename(file)} still contains invalid STUN URL`);
    }
});

test("voice syncRoomState and ensurePeer fail soft when RTCPeerConnection throws", async () => {
    const originalDocument = global.document;
    const originalNavigator = global.navigator;
    const originalRTCPeerConnection = global.RTCPeerConnection;
    const originalRTCIceCandidate = global.RTCIceCandidate;
    const originalRTCSessionDescription = global.RTCSessionDescription;
    const warnings = [];

    Object.defineProperty(global, "document", {
        value: {
            getElementById(id) {
                if (id === "voice-slot" || id === "voice-btn" || id === "voice-status") {
                    return {
                        classList: {
                            toggle() {},
                            add() {},
                            remove() {}
                        },
                        disabled: false,
                        title: "",
                        textContent: "",
                        setAttribute() {}
                    };
                }
                return null;
            },
            querySelectorAll() {
                return [];
            }
        },
        configurable: true
    });
    Object.defineProperty(global, "navigator", {
        value: {
            mediaDevices: {
                getUserMedia: async () => ({ getAudioTracks: () => [] })
            }
        },
        configurable: true
    });
    global.RTCPeerConnection = class {
        constructor() {
            throw new Error("bad ice");
        }
    };
    global.RTCIceCandidate = class {};
    global.RTCSessionDescription = class {};

    const originalWarn = console.warn;
    console.warn = (...args) => {
        warnings.push(args.map((value) => String(value)).join(" "));
    };

    try {
        const { VoiceChatManager } = await import("../../js/voice.js");
        const game = {
            network: {
                room: { sessionId: "session-me" },
                getVoiceConfig: async () => ({
                    iceServers: [{ urls: ["stun:global.stun.twilio.com:3478"] }],
                    iceTransportPolicy: "all",
                    iceCandidatePoolSize: 2,
                    hasTurn: false
                })
            },
            t: (key) => key,
            renderer: {
                showMessage() {}
            }
        };
        const voice = new VoiceChatManager(game);

        assert.doesNotThrow(() => voice.syncRoomState({
            players: [
                { sessionId: "session-me", isBot: false, name: "Me" },
                { sessionId: "session-other", isBot: false, name: "Other" }
            ]
        }));
        assert.ok(warnings.some((entry) => entry.includes("[VOICE] Failed to create peer connection:") || entry.includes("[VOICE] Failed to sync voice state")));
    } finally {
        console.warn = originalWarn;
        if (typeof originalDocument !== "undefined") {
            Object.defineProperty(global, "document", { value: originalDocument, configurable: true });
        } else {
            delete global.document;
        }
        if (typeof originalNavigator !== "undefined") {
            Object.defineProperty(global, "navigator", { value: originalNavigator, configurable: true });
        } else {
            delete global.navigator;
        }
        global.RTCPeerConnection = originalRTCPeerConnection;
        global.RTCIceCandidate = originalRTCIceCandidate;
        global.RTCSessionDescription = originalRTCSessionDescription;
    }
});
