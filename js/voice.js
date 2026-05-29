const DEFAULT_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" }
];

function isDebugLoggingEnabled() {
    if (typeof window === "undefined") return false;
    try {
        return window.__DOMINO_DEBUG_LOGS === true || window.localStorage?.getItem("dominoDebugLogs") === "true";
    } catch {
        return false;
    }
}

function debugLog(...args) {
    if (isDebugLoggingEnabled()) console.log(...args);
}

function supportsVoiceChat() {
    return typeof RTCPeerConnection !== "undefined"
        && typeof RTCIceCandidate !== "undefined"
        && typeof RTCSessionDescription !== "undefined"
        && typeof navigator !== "undefined"
        && (typeof window === "undefined" || window.isSecureContext || ["localhost", "127.0.0.1"].includes(window.location?.hostname) || !!window.Capacitor)
        && Boolean(navigator.mediaDevices?.getUserMedia);
}

export class VoiceChatManager {
    constructor(game) {
        debugLog("[VOICE_DEBUG] init");
        this.game = game;
        this.peerConnections = new Map();
        this.peerSenders = new Map();
        this.remoteAudioElements = new Map();
        this.remoteSpeaking = new Map();
        this.roomState = null;
        this.localStream = null;
        this.localAudioTrack = null;
        this.isSpeaking = false;
        this.isEnabled = false;
        this.destroyed = false;
        this.statusText = "";
        this.iceConfig = null;
        this.iceConfigPromise = null;
        this.iceConfigError = "";
        this.audioPlaybackBlocked = false;
        this.remoteAudioPlayback = new Map();
    }

    isAvailable() {
        return supportsVoiceChat() && Boolean(this.game?.network?.room);
    }

    get mySessionId() {
        return this.game?.network?.room?.sessionId || "";
    }

    getVoiceButton() {
        return document.getElementById("voice-btn");
    }

    getVoiceStatusEl() {
        return document.getElementById("voice-status");
    }

    getVoiceSlot() {
        return document.getElementById("voice-slot");
    }

    getRemoteHumanSessions() {
        const players = Array.isArray(this.roomState?.players) ? this.roomState.players : [];
        return players
            .filter((player) => player && !player.isBot && String(player.sessionId || "").trim())
            .map((player) => String(player.sessionId).trim())
            .filter((sessionId) => sessionId && sessionId !== this.mySessionId);
    }

    syncRoomState(roomState = null) {
        try {
            this.roomState = roomState;
            if (this.game?.network?.room) {
                debugLog("[VOICE_DEBUG] identity", {
                    sessionId: this.mySessionId,
                    roomId: this.game.network.room.roomId || this.game.network.room.id
                });
            }
            debugLog("[VOICE] voice:init", {
                hasRoom: Boolean(this.game?.network?.room),
                remoteHumans: this.getRemoteHumanSessions().length,
                audioPlaybackBlocked: this.audioPlaybackBlocked
            });
            this.syncVisibility();
            void this.prefetchIceConfig();
            if (!this.isAvailable()) {
                this.resetRoom();
                return;
            }

            const remoteSessions = new Set(this.getRemoteHumanSessions());
            for (const sessionId of Array.from(this.peerConnections.keys())) {
                if (!remoteSessions.has(sessionId)) {
                    this.closePeer(sessionId);
                }
            }
            for (const sessionId of remoteSessions) {
                try {
                    this.ensurePeer(sessionId);
                } catch (error) {
                    console.warn("[VOICE] Failed to sync voice state", error);
                }
            }
            this.updateSpeakerUi();
        } catch (error) {
            console.warn("[VOICE] Failed to sync voice state", error);
        }
    }

    syncVisibility() {
        const slot = this.getVoiceSlot();
        const button = this.getVoiceButton();
        const online = this.isAvailable();
        if (slot) slot.classList.toggle("is-hidden", !online);
        if (button) {
            button.disabled = !online;
            button.classList.toggle("is-ready", online);
            if (!online) {
                button.classList.remove("is-speaking");
            }
        }
        if (!online) {
            this.setStatus("");
        } else if (!supportsVoiceChat()) {
            this.setStatus(this.game?.t?.("voice-unavailable") || "Voice unavailable");
        } else if (this.audioPlaybackBlocked) {
            this.setStatus(this.game?.t?.("voice-enable-sound") || "Enable sound");
        } else if (!this.statusText) {
            this.setStatus(this.game?.t?.("voice-ready") || "Voice ready");
        }
        this.updateAudioUnlockUi();
    }

    setStatus(text = "") {
        this.statusText = String(text || "");
        const el = this.getVoiceStatusEl();
        if (el) el.textContent = this.statusText;
        const button = this.getVoiceButton();
        if (button) {
            const title = this.statusText || this.game?.t?.("voice-hold-to-talk") || "Hold to talk";
            button.title = title;
            button.setAttribute("aria-label", title);
        }
    }

    async ensureLocalVoiceReady() {
        if (this.localStream && this.localAudioTrack) return true;
        try {
            debugLog("[VOICE_DEBUG] getUserMedia:start");
            debugLog("[VOICE] voice:getUserMedia:start", {
                secureContext: Boolean(typeof window === "undefined" ? true : window.isSecureContext),
                hasNavigator: typeof navigator !== "undefined"
            });
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            this.localAudioTrack = this.localStream.getAudioTracks()[0] || null;
            if (this.localAudioTrack) {
                this.localAudioTrack.enabled = false;
            }
            debugLog("[VOICE_DEBUG] voice:mic:ready", {
                sessionId: this.mySessionId,
                tracks: this.localStream.getAudioTracks().map(t => ({
                    enabled: t.enabled,
                    muted: t.muted,
                    readyState: t.readyState
                }))
            });
            debugLog("[VOICE] voice:getUserMedia:success", {
                trackCount: this.localStream?.getAudioTracks?.().length || 0,
                trackReadyState: this.localAudioTrack?.readyState || "",
                trackEnabled: Boolean(this.localAudioTrack?.enabled)
            });
            return true;
        } catch (error) {
            debugLog("[VOICE_DEBUG] getUserMedia:error");
            debugLog("[VOICE] voice:getUserMedia:error", {
                name: String(error?.name || ""),
                message: String(error?.message || error || "")
            });
            console.warn("[Voice] Microphone access failed:", error);
            this.setStatus(this.game?.t?.("voice-denied") || "Microphone access denied");
            this.game?.renderer?.showMessage?.(this.game?.t?.("voice-denied") || "Microphone access denied", 2200);
            return false;
        }
    }

    async rebuildVoicePeersAfterMicReady() {
        debugLog("[VOICE_DEBUG] voice:peers:rebuild:start");
        const sessionIds = Array.from(this.peerConnections.keys());
        for (const sessionId of sessionIds) {
            this.closePeer(sessionId);
        }
        this.peerConnections.clear();
        this.peerSenders.clear();
        this.remoteAudioElements.clear();

        const remoteSessions = this.getRemoteHumanSessions();
        for (const sessionId of remoteSessions) {
            try {
                this.ensurePeer(sessionId);
            } catch (error) {
                console.warn("[VOICE] Failed to rebuild voice peer for", sessionId, error);
            }
        }
        debugLog("[VOICE_DEBUG] voice:peers:rebuild:done");
    }

    requestNegotiationForLocalTrack() {
        const remoteSessions = this.getRemoteHumanSessions();
        for (const remoteSessionId of remoteSessions) {
            if (this.shouldInitiate(remoteSessionId)) {
                void this.startOffer(remoteSessionId, { reason: "local-track-ready" });
            } else {
                debugLog(`[VOICE_DEBUG] renegotiate:send reason local-track-ready targetSessionId=${remoteSessionId}`);
                this.sendSignal(remoteSessionId, "renegotiate", {
                    reason: "local-track-ready"
                });
            }
        }
    }

    async startSpeaking() {
        if (this.destroyed || !this.isAvailable()) return false;
        if (!this.localStream || !this.localAudioTrack) {
            const ok = await this.ensureLocalVoiceReady();
            if (!ok) return false;
            await this.rebuildVoicePeersAfterMicReady();
            this.requestNegotiationForLocalTrack();
        }

        this.isEnabled = true;
        this.isSpeaking = true;
        if (this.localAudioTrack) {
            this.localAudioTrack.enabled = true;
            debugLog("[VOICE_DEBUG] localTrack", {
                kind: this.localAudioTrack.kind,
                enabled: this.localAudioTrack.enabled,
                muted: this.localAudioTrack.muted,
                readyState: this.localAudioTrack.readyState
            });
        }
        debugLog("[VOICE_DEBUG] voice:speaking:on", { sessionId: this.mySessionId });
        this.updateLocalSpeakingUi(true);
        this.broadcastSpeakingState(true);
        this.setStatus(this.game?.t?.("voice-speaking") || "Speaking");
        return true;
    }

    stopSpeaking() {
        if (this.destroyed) return;
        this.isSpeaking = false;
        if (this.localAudioTrack) {
            this.localAudioTrack.enabled = false;
            debugLog("[VOICE_DEBUG] localTrack", {
                kind: this.localAudioTrack.kind,
                enabled: this.localAudioTrack.enabled,
                muted: this.localAudioTrack.muted,
                readyState: this.localAudioTrack.readyState
            });
        }
        debugLog("[VOICE_DEBUG] voice:speaking:off", { sessionId: this.mySessionId });
        this.updateLocalSpeakingUi(false);
        if (this.isEnabled && this.isAvailable()) {
            this.broadcastSpeakingState(false);
            this.setStatus(this.game?.t?.("voice-ready") || "Voice ready");
        }
    }

    resetRoom() {
        this.isSpeaking = false;
        this.isEnabled = false;
        this.statusText = "";
        this.audioPlaybackBlocked = false;
        this.updateLocalSpeakingUi(false);
        for (const sessionId of Array.from(this.peerConnections.keys())) {
            this.closePeer(sessionId);
        }
        this.clearRemoteSpeaking();
        this.remoteAudioPlayback.clear();
        this.updateAudioUnlockUi();
    }

    destroy() {
        this.stopSpeaking();
        this.resetRoom();
        this.iceConfigPromise = null;
        if (this.localAudioTrack) {
            this.localAudioTrack.stop();
            this.localAudioTrack = null;
        }
        if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
                try { track.stop(); } catch {}
            }
            this.localStream = null;
        }
        this.setStatus("");
    }

    updateLocalSpeakingUi(active) {
        const button = this.getVoiceButton();
        if (button) button.classList.toggle("is-speaking", !!active);
    }

    clearRemoteSpeaking() {
        this.remoteSpeaking.clear();
        this.updateSpeakerUi();
    }

    updateAudioUnlockUi() {
        const button = document.getElementById("voice-unlock-btn");
        if (!button) return;
        const shouldShow = this.audioPlaybackBlocked && this.isAvailable();
        if (shouldShow && button.classList.contains("is-hidden")) {
            debugLog("[VOICE_DEBUG] enableSound:shown");
        }
        button.classList.toggle("is-hidden", !shouldShow);
        const title = this.game?.t?.("voice-enable-sound") || "Enable sound";
        button.textContent = title;
        button.title = title;
        button.setAttribute("aria-label", title);
    }

    async unlockRemoteAudio() {
        const audioEntries = Array.from(this.remoteAudioElements.entries());
        if (!audioEntries.length) {
            this.audioPlaybackBlocked = false;
            this.updateAudioUnlockUi();
            return true;
        }

        let unlocked = false;
        for (const [sessionId, audio] of audioEntries) {
            if (!audio) continue;
            try {
                audio.muted = false;
                audio.volume = 1;
                debugLog("[VOICE_DEBUG] audio:play:start", { sessionId, context: "unlock" });
                await audio.play();
                debugLog("[VOICE_DEBUG] audio:play:success", { sessionId, context: "unlock" });
                this.remoteAudioPlayback.set(sessionId, true);
                unlocked = true;
            } catch (error) {
                this.remoteAudioPlayback.set(sessionId, false);
                if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
                    debugLog("[VOICE_DEBUG] autoplay:blocked", { sessionId, context: "unlock", error: error.name });
                }
                debugLog("[VOICE_DEBUG] audio:play:error", {
                    sessionId,
                    context: "unlock",
                    name: String(error?.name || ""),
                    message: String(error?.message || error || "")
                });
                debugLog("[VOICE] voice:audioElement:play-blocked", {
                    sessionId,
                    name: String(error?.name || ""),
                    message: String(error?.message || error || "")
                });
            }
        }

        this.audioPlaybackBlocked = !unlocked && audioEntries.length > 0;
        this.updateAudioUnlockUi();
        this.updateSpeakerUi();
        return unlocked;
    }

    updateSpeakerUi() {
        const activeNames = [];
        const players = Array.isArray(this.roomState?.players) ? this.roomState.players : [];
        const playerBySession = new Map(players.map((player) => [String(player.sessionId || ""), player]));
        for (const [sessionId, state] of this.remoteSpeaking.entries()) {
            if (!state?.speaking) continue;
            
            // Check peer connection state
            const peer = this.peerConnections.get(sessionId);
            const isConn = peer && (peer.connectionState === "connected" || peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed");
            if (!isConn) continue;

            // Check remote audio playback
            if (this.remoteAudioPlayback.get(sessionId) === false) continue;

            const name = playerBySession.get(sessionId)?.name || state.name || "";
            if (name) activeNames.push(name);
        }

        const button = this.getVoiceButton();
        if (button) {
            button.classList.toggle("has-remote-voice", activeNames.length > 0);
            button.dataset.remoteSpeakers = String(activeNames.length);
        }

        const statusEl = this.getVoiceStatusEl();
        if (statusEl) {
            if (!this.isAvailable()) {
                statusEl.textContent = "";
            } else if (this.audioPlaybackBlocked) {
                statusEl.textContent = this.game?.t?.("voice-enable-sound") || "Enable sound";
            } else if (this.isSpeaking) {
                statusEl.textContent = this.game?.t?.("voice-speaking") || "Speaking";
            } else if (activeNames.length > 0) {
                const label = this.game?.t?.("voice-listening-to") || "Hearing";
                statusEl.textContent = `${label}: ${activeNames.slice(0, 2).join(", ")}`;
            } else if (this.statusText) {
                statusEl.textContent = this.statusText;
            } else {
                statusEl.textContent = this.game?.t?.("voice-ready") || "Voice ready";
            }
        }

        const chips = document.querySelectorAll('.room-player-chip[data-session-id]');
        chips.forEach((chip) => {
            const sessionId = String(chip.dataset.sessionId || "");
            
            // Apply speaking indicator only if connection is established and remote audio is playing
            const peer = this.peerConnections.get(sessionId);
            const isConn = peer && (peer.connectionState === "connected" || peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed");
            const isSpeaking = isConn && (this.remoteSpeaking.get(sessionId)?.speaking || false) && (this.remoteAudioPlayback.get(sessionId) !== false);
            chip.classList.toggle("speaking", isSpeaking);
        });

        const indicatorSource = !this.isAvailable()
            ? "unavailable"
            : this.audioPlaybackBlocked
                ? "audio-playback-blocked"
                : this.isSpeaking
                    ? "local-track"
                    : activeNames.length > 0
                        ? "remote-track"
                        : "idle";
        debugLog("[VOICE] voice:speakingIndicator", {
            source: indicatorSource,
            localTrackReady: Boolean(this.localAudioTrack?.readyState === "live" && this.localAudioTrack?.enabled),
            remoteSpeakingCount: activeNames.length,
            audioPlaybackBlocked: this.audioPlaybackBlocked
        });
    }

    broadcastSpeakingState(speaking) {
        if (!this.game?.network?.room) return;
        const players = Array.isArray(this.roomState?.players) ? this.roomState.players : [];
        const selfPlayer = players.find((player) => String(player?.sessionId || "") === this.mySessionId);
        this.game.network.sendVoiceSignal({
            kind: "state",
            speaking: Boolean(speaking),
            name: selfPlayer?.name || this.game?.playerName || ""
        });
        this.updateSpeakerUi();
    }

    attachLocalTrackToPeers() {
        if (!this.localAudioTrack) return;
        for (const [sessionId, sender] of this.peerSenders.entries()) {
            if (!sender) continue;
            sender.replaceTrack(this.localAudioTrack).then(() => {
                debugLog("[VOICE_DEBUG] peer:addTrack", {
                    localSessionId: this.mySessionId,
                    remoteSessionId: sessionId,
                    trackKind: this.localAudioTrack.kind,
                    trackId: this.localAudioTrack.id,
                    readyState: this.localAudioTrack.readyState
                });
            }).catch((error) => {
                console.warn("[Voice] replaceTrack failed for", sessionId, error);
            });
        }
    }

    async prefetchIceConfig() {
        if (this.iceConfig || this.iceConfigPromise) return this.iceConfig || null;
        this.iceConfigPromise = this.resolveIceConfig().finally(() => {
            this.iceConfigPromise = null;
        });
        return this.iceConfigPromise;
    }

    async resolveIceConfig() {
        const fallback = {
            iceServers: DEFAULT_ICE_SERVERS,
            iceTransportPolicy: "all",
            iceCandidatePoolSize: 2,
            hasTurn: false
        };

        try {
            const config = await this.game?.network?.getVoiceConfig?.();
            if (!config || !Array.isArray(config.iceServers) || !config.iceServers.length) {
                this.iceConfig = fallback;
                return fallback;
            }

            const normalized = {
                iceServers: config.iceServers
                    .map((server) => ({
                        urls: Array.isArray(server?.urls)
                            ? server.urls.map((url) => String(url || "").trim()).filter(Boolean)
                            : [],
                        ...(server?.username ? { username: String(server.username).trim() } : {}),
                        ...(server?.credential ? { credential: String(server.credential).trim() } : {})
                    }))
                    .filter((server) => server.urls.length > 0),
                iceTransportPolicy: String(config.iceTransportPolicy || "all").trim() || "all",
                iceCandidatePoolSize: Number(config.iceCandidatePoolSize || 2) || 2,
                hasTurn: Boolean(config.hasTurn)
            };

            if (!normalized.iceServers.length) {
                this.iceConfig = fallback;
                return fallback;
            }

            this.iceConfig = normalized;
            return normalized;
        } catch (error) {
            this.iceConfigError = String(error?.message || error || "");
            this.iceConfig = fallback;
            return fallback;
        }
    }

    getPeerConfig() {
        const config = this.iceConfig || {
            iceServers: DEFAULT_ICE_SERVERS,
            iceTransportPolicy: "all",
            iceCandidatePoolSize: 2,
            hasTurn: false
        };
        return {
            iceServers: config.iceServers || DEFAULT_ICE_SERVERS,
            iceTransportPolicy: config.iceTransportPolicy || "all",
            iceCandidatePoolSize: config.iceCandidatePoolSize || 2
        };
    }

    ensurePeer(remoteSessionId) {
        const targetSessionId = String(remoteSessionId || "").trim();
        if (!targetSessionId || targetSessionId === this.mySessionId) return null;

        let peer = this.peerConnections.get(targetSessionId);
        if (peer) return peer;

        try {
            peer = new RTCPeerConnection(this.getPeerConfig());
        } catch (error) {
            console.warn("[VOICE] Failed to create peer connection:", error);
            this.peerConnections.delete(targetSessionId);
            this.peerSenders.delete(targetSessionId);
            return null;
        }
        debugLog("[VOICE_DEBUG] peer:create", {
            localSessionId: this.mySessionId,
            remoteSessionId: targetSessionId,
            initiator: this.shouldInitiate(targetSessionId) ? "true" : "false"
        });
        debugLog("[VOICE] voice:peer:create", {
            sessionId: targetSessionId,
            hasLocalTrack: Boolean(this.localAudioTrack),
            iceServers: Array.isArray(this.getPeerConfig()?.iceServers) ? this.getPeerConfig().iceServers.length : 0
        });
        this.peerConnections.set(targetSessionId, peer);

        let transceiver;
        if (this.localAudioTrack) {
            transceiver = peer.addTransceiver(this.localAudioTrack, { direction: "sendrecv" });
        } else {
            transceiver = peer.addTransceiver("audio", { direction: "sendrecv" });
        }
        this.peerSenders.set(targetSessionId, transceiver.sender);
        debugLog("[VOICE_DEBUG] peer:addTrack", {
            localSessionId: this.mySessionId,
            remoteSessionId: targetSessionId,
            trackKind: transceiver.sender?.track?.kind || "audio",
            trackId: transceiver.sender?.track?.id || "null",
            readyState: transceiver.sender?.track?.readyState || "live"
        });
        debugLog("[VOICE] voice:track:add", {
            sessionId: targetSessionId,
            trackKind: transceiver.sender?.track?.kind || "audio",
            trackEnabled: Boolean(transceiver.sender?.track?.enabled)
        });

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                debugLog("[VOICE_DEBUG] ice:send", {
                    fromSessionId: this.mySessionId,
                    targetSessionId: targetSessionId
                });
                this.sendSignal(targetSessionId, "candidate", { candidate: event.candidate });
            }
        };

        peer.ontrack = (event) => {
            const stream = event.streams?.[0] || (event.track ? new MediaStream([event.track]) : null);
            debugLog("[VOICE_DEBUG] voice:remote:ontrack", {
                localSessionId: this.mySessionId,
                fromSessionId: targetSessionId,
                streamId: stream ? stream.id : "null",
                trackId: event.track ? event.track.id : "null",
                readyState: event.track ? event.track.readyState : "null"
            });
            debugLog(`[VOICE_DEBUG] remote:ontrack fromSessionId=${targetSessionId}`);
            if (stream) {
                this.attachRemoteStream(targetSessionId, stream);
            }
        };

        peer.onconnectionstatechange = () => {
            debugLog("[VOICE_DEBUG] peer:state", {
                localSessionId: this.mySessionId,
                remoteSessionId: targetSessionId,
                iceConnectionState: peer.iceConnectionState,
                connectionState: peer.connectionState,
                signalingState: peer.signalingState
            });
            debugLog("[VOICE] voice:connectionState", {
                sessionId: targetSessionId,
                state: peer.connectionState
            });
            if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
                const isStale = !this.getRemoteHumanSessions().includes(targetSessionId);
                if (isStale || peer.connectionState === "failed") {
                    this.closePeer(targetSessionId);
                }
            }
        };

        peer.oniceconnectionstatechange = () => {
            debugLog("[VOICE_DEBUG] peer:state", {
                localSessionId: this.mySessionId,
                remoteSessionId: targetSessionId,
                iceConnectionState: peer.iceConnectionState,
                connectionState: peer.connectionState,
                signalingState: peer.signalingState
            });
            debugLog("[VOICE] voice:iceState", {
                sessionId: targetSessionId,
                state: peer.iceConnectionState
            });
            if (["failed", "closed"].includes(peer.iceConnectionState)) {
                this.closePeer(targetSessionId);
            }
        };

        peer.onsignalingstatechange = () => {
            debugLog("[VOICE_DEBUG] peer:state", {
                localSessionId: this.mySessionId,
                remoteSessionId: targetSessionId,
                iceConnectionState: peer.iceConnectionState,
                connectionState: peer.connectionState,
                signalingState: peer.signalingState
            });
        };

        if (this.localAudioTrack) {
            debugLog("[VOICE_DEBUG] voice:offer:send:with-local-track true", { targetSessionId });
            if (this.shouldInitiate(targetSessionId)) {
                void this.startOffer(targetSessionId);
            }
        } else {
            debugLog("[VOICE_DEBUG] voice:offer:send:with-local-track false", { targetSessionId });
            debugLog("[VOICE_DEBUG] voice:offer:blocked:no-local-track", { targetSessionId });
        }

        return peer;
    }

    shouldInitiate(remoteSessionId) {
        const mine = String(this.mySessionId || "");
        const remote = String(remoteSessionId || "");
        return !!mine && !!remote && mine < remote;
    }

    async startOffer(remoteSessionId, options = {}) {
        const peer = this.peerConnections.get(remoteSessionId);
        if (!peer || peer.signalingState !== "stable") return;

        const allowReceiveOnlyOffer = ["renegotiate", "remote-track-ready", "local-track-ready"].includes(options.reason);
        if (!this.localAudioTrack && !allowReceiveOnlyOffer) {
            debugLog("[VOICE_DEBUG] voice:offer:blocked:no-local-track", { targetSessionId: remoteSessionId });
            return;
        }

        try {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            const reason = options.reason || "initial";
            debugLog("[VOICE_DEBUG] offer:send", {
                fromSessionId: this.mySessionId,
                targetSessionId: remoteSessionId,
                reason: reason
            });
            debugLog(`[VOICE_DEBUG] offer:send reason ${reason} targetSessionId=${remoteSessionId}`);
            this.sendSignal(remoteSessionId, "offer", {
                description: peer.localDescription,
                reason: reason
            });
        } catch (error) {
            console.warn("[Voice] offer failed:", error);
        }
    }

    async handleSignal(payload = {}) {
        if (!this.isAvailable()) return;
        const fromSessionId = String(payload.fromSessionId || "").trim();
        const targetSessionId = String(payload.targetSessionId || "").trim();
        if (!fromSessionId || fromSessionId === this.mySessionId) return;

        if (payload.kind === "state") {
            if (payload.speaking) {
                this.remoteSpeaking.set(fromSessionId, {
                    speaking: true,
                    name: String(payload.name || "").trim()
                });
            } else {
                this.remoteSpeaking.delete(fromSessionId);
            }
            this.updateSpeakerUi();
            return;
        }

        if (payload.kind === "renegotiate") {
            if (targetSessionId !== this.mySessionId) {
                debugLog("[VOICE_DEBUG] renegotiate:receive", {
                    fromSessionId,
                    targetSessionId,
                    accepted: "ignored"
                });
                return;
            }

            if (this.shouldInitiate(fromSessionId)) {
                debugLog("[VOICE_DEBUG] renegotiate:receive", {
                    fromSessionId,
                    targetSessionId,
                    accepted: "accepted",
                    reason: payload.reason || "renegotiate"
                });
                debugLog(`[VOICE_DEBUG] renegotiate:receive accepted reason ${payload.reason || "renegotiate"} fromSessionId=${fromSessionId}`);
                
                if (payload.reason === "local-track-ready") {
                    debugLog("[VOICE_DEBUG] renegotiate: recreate peer connection to match remote", { fromSessionId });
                    this.closePeer(fromSessionId);
                }
                
                this.ensurePeer(fromSessionId);
                const offerReason = payload.reason === "local-track-ready" ? "remote-track-ready" : (payload.reason || "renegotiate");
                void this.startOffer(fromSessionId, { reason: offerReason });
            } else {
                debugLog("[VOICE_DEBUG] renegotiate:receive", {
                    fromSessionId,
                    targetSessionId,
                    accepted: "ignored",
                    reason: "not_initiator"
                });
            }
            return;
        }

        if (["offer", "answer", "candidate"].includes(payload.kind)) {
            if (targetSessionId !== this.mySessionId) {
                debugLog(`[VOICE_DEBUG] ${payload.kind}:receive`, {
                    fromSessionId,
                    targetSessionId,
                    accepted: "ignored"
                });
                return;
            }
        }

        if (payload.kind === "offer" && description) {
            if (payload.reason === "local-track-ready") {
                debugLog("[VOICE_DEBUG] offer: recreate peer connection to match remote", { fromSessionId });
                this.closePeer(fromSessionId);
            }
        }

        const peer = this.ensurePeer(fromSessionId);
        if (!peer) return;

        const description = payload.description || payload.sdp || null;
        const candidate = payload.candidate || null;

        try {
            if (payload.kind === "offer" && description) {
                debugLog("[VOICE_DEBUG] offer:receive", {
                    fromSessionId,
                    targetSessionId,
                    accepted: "accepted"
                });
                await peer.setRemoteDescription(new RTCSessionDescription(description));
                await this.flushQueuedCandidates(peer);
                if (this.localAudioTrack) {
                    const sender = this.peerSenders.get(fromSessionId);
                    if (sender && sender.track !== this.localAudioTrack) {
                        await sender.replaceTrack(this.localAudioTrack);
                        debugLog("[VOICE_DEBUG] peer:addTrack", {
                            localSessionId: this.mySessionId,
                            remoteSessionId: fromSessionId,
                            trackKind: this.localAudioTrack.kind,
                            trackId: this.localAudioTrack.id,
                            readyState: this.localAudioTrack.readyState
                        });
                    }
                }
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                debugLog("[VOICE_DEBUG] answer:send", {
                    fromSessionId: this.mySessionId,
                    targetSessionId: fromSessionId
                });
                this.sendSignal(fromSessionId, "answer", { description: peer.localDescription });
                return;
            }

            if (payload.kind === "answer" && description) {
                debugLog("[VOICE_DEBUG] answer:receive", {
                    fromSessionId,
                    targetSessionId,
                    signalingState: peer.signalingState
                });
                debugLog(`[VOICE_DEBUG] answer:receive fromSessionId=${fromSessionId} targetSessionId=${targetSessionId}`);
                if (peer.signalingState !== "have-local-offer") {
                    debugLog("[VOICE_DEBUG] answer:ignored", {
                        reason: "unexpected_signaling_state",
                        signalingState: peer.signalingState,
                        fromSessionId,
                        targetSessionId
                    });
                    return;
                }
                await peer.setRemoteDescription(new RTCSessionDescription(description));
                debugLog("[VOICE_DEBUG] answer:setRemoteDescription:success", {
                    fromSessionId,
                    targetSessionId
                });
                await this.flushQueuedCandidates(peer);
                debugLog("[VOICE_DEBUG] peer:state", {
                    localSessionId: this.mySessionId,
                    remoteSessionId: fromSessionId,
                    iceConnectionState: peer.iceConnectionState,
                    connectionState: peer.connectionState,
                    signalingState: peer.signalingState
                });
                return;
            }

            if (payload.kind === "candidate" && candidate) {
                debugLog("[VOICE_DEBUG] ice:receive", {
                    fromSessionId,
                    targetSessionId,
                    accepted: "accepted"
                });
                if (peer.remoteDescription) {
                    await peer.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                    peer._queuedCandidates = peer._queuedCandidates || [];
                    peer._queuedCandidates.push(candidate);
                }
                return;
            }

        } catch (error) {
            console.warn("[Voice] signal handling failed:", error);
        }
    }

    async flushQueuedCandidates(peer) {
        if (!peer?.remoteDescription || !Array.isArray(peer._queuedCandidates) || !peer._queuedCandidates.length) return;
        const queued = peer._queuedCandidates.splice(0);
        for (const item of queued) {
            try {
                await peer.addIceCandidate(new RTCIceCandidate(item));
            } catch (error) {
                console.warn("[Voice] queued candidate failed:", error);
            }
        }
    }

    sendSignal(targetSessionId, kind, data = {}) {
        if (!this.game?.network?.room) return;
        this.game.network.sendVoiceSignal({
            kind,
            targetSessionId,
            ...data
        });
    }

    attachRemoteStream(sessionId, stream) {
        let audio = this.remoteAudioElements.get(sessionId);
        if (!audio) {
            audio = document.createElement("audio");
            audio.id = "audio-element-" + sessionId;
            audio.autoplay = true;
            audio.playsInline = true;
            audio.preload = "auto";
            audio.className = "voice-remote-audio";
            audio.dataset.sessionId = sessionId;
            audio.style.display = "none";
            audio.muted = false;
            audio.volume = 1;
            audio.addEventListener("playing", () => {
                debugLog("[VOICE_DEBUG] voice:audio:playing", {
                    localSessionId: this.mySessionId,
                    fromSessionId: sessionId
                });
                this.remoteAudioPlayback.set(sessionId, true);
                this.audioPlaybackBlocked = false;
                this.updateAudioUnlockUi();
                this.updateSpeakerUi();
            });
            audio.addEventListener("pause", () => {
                this.remoteAudioPlayback.set(sessionId, false);
                this.updateSpeakerUi();
            });
            audio.addEventListener("ended", () => {
                this.remoteAudioPlayback.set(sessionId, false);
                this.updateSpeakerUi();
            });
            document.body.appendChild(audio);
            this.remoteAudioElements.set(sessionId, audio);
        }
        audio.srcObject = stream;
        debugLog("[VOICE_DEBUG] audio:attach", {
            localSessionId: this.mySessionId,
            fromSessionId: sessionId,
            audioElementId: audio.id
        });
        debugLog("[VOICE] voice:audioElement:attached", {
            sessionId,
            trackCount: Array.isArray(stream?.getAudioTracks?.()) ? stream.getAudioTracks().length : 0
        });
        debugLog("[VOICE_DEBUG] audio:play:start", { sessionId });
        audio.play().then(() => {
            debugLog("[VOICE_DEBUG] voice:audio:playing", {
                localSessionId: this.mySessionId,
                fromSessionId: sessionId
            });
            debugLog("[VOICE_DEBUG] audio:play:success", {
                localSessionId: this.mySessionId,
                fromSessionId: sessionId
            });
            this.remoteAudioPlayback.set(sessionId, true);
            this.audioPlaybackBlocked = false;
            this.updateAudioUnlockUi();
            this.updateSpeakerUi();
        }).catch((error) => {
            this.remoteAudioPlayback.set(sessionId, false);
            this.audioPlaybackBlocked = true;
            if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
                debugLog("[VOICE_DEBUG] autoplay:blocked", { sessionId, name: error.name });
            }
            debugLog("[VOICE_DEBUG] audio:play:error", {
                localSessionId: this.mySessionId,
                fromSessionId: sessionId,
                errorName: String(error?.name || ""),
                errorMessage: String(error?.message || error || "")
            });
            debugLog("[VOICE] voice:audioElement:play-blocked", {
                sessionId,
                name: String(error?.name || ""),
                message: String(error?.message || error || "")
            });
            this.updateAudioUnlockUi();
            this.updateSpeakerUi();
        });
    }

    closePeer(sessionId) {
        const peer = this.peerConnections.get(sessionId);
        if (peer) {
            try { peer.close(); } catch {}
        }
        this.peerConnections.delete(sessionId);
        this.peerSenders.delete(sessionId);
        const audio = this.remoteAudioElements.get(sessionId);
        if (audio) {
            try { audio.srcObject = null; } catch {}
            audio.remove();
        }
        this.remoteAudioElements.delete(sessionId);
        this.remoteSpeaking.delete(sessionId);
        this.remoteAudioPlayback.delete(sessionId);
        if (!this.remoteAudioElements.size) {
            this.audioPlaybackBlocked = false;
        }
        this.updateAudioUnlockUi();
        this.updateSpeakerUi();
    }
}
