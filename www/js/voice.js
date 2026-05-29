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
        this.peersBySessionId = new Map();
        this.remoteAudioBySessionId = new Map();
        this.voiceEnabledBySessionId = new Map();
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
            
            if (roomState && Array.isArray(roomState.players)) {
                for (const p of roomState.players) {
                    if (p && p.sessionId && p.sessionId !== this.mySessionId) {
                        this.voiceEnabledBySessionId.set(p.sessionId, Boolean(p.voiceEnabled));
                    }
                }
            }

            if (!this.isAvailable()) {
                this.resetRoom();
                return;
            }

            if (!this.isEnabled) {
                this.syncVisibility();
                this.updateSpeakerUi();
                return;
            }

            const activeRemoteEnabled = new Set();
            if (roomState && Array.isArray(roomState.players)) {
                for (const p of roomState.players) {
                    if (p && p.sessionId && p.sessionId !== this.mySessionId && p.voiceEnabled) {
                        activeRemoteEnabled.add(p.sessionId);
                    }
                }
            }

            for (const sessionId of Array.from(this.peersBySessionId.keys())) {
                if (!activeRemoteEnabled.has(sessionId)) {
                    this.closePeer(sessionId, "sync-disabled");
                }
            }

            if (this.localStream) {
                for (const sessionId of activeRemoteEnabled) {
                    if (!this.peersBySessionId.has(sessionId)) {
                        this.connectPeer(sessionId);
                    }
                }
            }

            this.syncVisibility();
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
            button.classList.toggle("is-speaking", online && this.isEnabled);
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
            const title = this.statusText || this.game?.t?.("voice-ready") || "Voice ready";
            button.title = title;
            button.setAttribute("aria-label", title);
        }
    }

    async toggleVoice() {
        if (this.destroyed || !this.isAvailable()) return;
        if (this.isEnabled) {
            debugLog("[VOICE_DEBUG] toggle:off");
            await this.disableVoice();
        } else {
            debugLog("[VOICE_DEBUG] toggle:on");
            await this.enableVoice();
        }
    }

    async enableVoice() {
        if (this.destroyed || !this.isAvailable()) return;
        this.isEnabled = true;
        this.isSpeaking = true;

        debugLog("[VOICE_DEBUG] getUserMedia:start");
        try {
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
                this.localAudioTrack.enabled = true;
            }
            debugLog("[VOICE_DEBUG] getUserMedia:success");
        } catch (error) {
            debugLog("[VOICE_DEBUG] getUserMedia:error");
            this.isEnabled = false;
            this.isSpeaking = false;
            this.setStatus(this.game?.t?.("voice-denied") || "Microphone access denied");
            this.game?.renderer?.showMessage?.(this.game?.t?.("voice-denied") || "Microphone access denied", 2200);
            return;
        }

        debugLog("[VOICE_DEBUG] voice:state:send enabled true");
        this.game.network.sendVoiceSignal({
            kind: "state",
            enabled: true,
            speaking: true,
            name: this.game?.playerName || ""
        });

        const remoteSessions = this.getRemoteHumanSessions();
        for (const sessionId of remoteSessions) {
            if (this.voiceEnabledBySessionId.get(sessionId) === true) {
                this.connectPeer(sessionId);
            }
        }

        this.setStatus(this.game?.t?.("voice-speaking") || "Speaking");
        this.syncVisibility();
        this.updateSpeakerUi();
    }

    async disableVoice() {
        this.isEnabled = false;
        this.isSpeaking = false;

        debugLog("[VOICE_DEBUG] voice:state:send enabled false");
        this.game.network.sendVoiceSignal({
            kind: "state",
            enabled: false,
            speaking: false,
            name: this.game?.playerName || ""
        });

        for (const sessionId of Array.from(this.peersBySessionId.keys())) {
            this.closePeer(sessionId, "local-disabled");
        }

        if (this.localAudioTrack) {
            try { this.localAudioTrack.stop(); } catch {}
            this.localAudioTrack = null;
        }
        if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
                try { track.stop(); } catch {}
            }
            this.localStream = null;
        }

        debugLog("[VOICE_DEBUG] voice:off:cleanup");

        this.setStatus(this.game?.t?.("voice-ready") || "Voice ready");
        this.syncVisibility();
        this.updateSpeakerUi();
    }

    connectPeer(remoteSessionId) {
        const targetSessionId = String(remoteSessionId || "").trim();
        if (!targetSessionId || targetSessionId === this.mySessionId) return null;

        let peer = this.peersBySessionId.get(targetSessionId);
        if (peer) return peer;

        const initiator = this.mySessionId < targetSessionId;
        debugLog(`[VOICE_DEBUG] peer:create ${this.mySessionId} ${targetSessionId} initiator ${initiator}`);

        try {
            peer = new RTCPeerConnection(this.getPeerConfig());
        } catch (error) {
            console.warn("[VOICE] Failed to create peer connection:", error);
            return null;
        }
        this.peersBySessionId.set(targetSessionId, peer);

        if (this.localStream) {
            for (const track of this.localStream.getAudioTracks()) {
                peer.addTrack(track, this.localStream);
                debugLog(`[VOICE_DEBUG] peer:addTrack ${track.id} ${track.readyState} ${track.enabled}`);
            }
        }

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                debugLog(`[VOICE_DEBUG] ice:send ${targetSessionId}`);
                this.sendSignal(targetSessionId, "ice", { candidate: event.candidate });
            }
        };

        peer.ontrack = (event) => {
            debugLog(`[VOICE_DEBUG] remote:ontrack ${targetSessionId}`);
            const stream = event.streams?.[0] || (event.track ? new MediaStream([event.track]) : null);
            if (stream) {
                this.attachRemoteStream(targetSessionId, stream);
            }
        };

        if (initiator) {
            void this.startOffer(targetSessionId);
        }

        return peer;
    }

    async startOffer(remoteSessionId) {
        const peer = this.peersBySessionId.get(remoteSessionId);
        if (!peer) return;
        try {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            debugLog(`[VOICE_DEBUG] offer:send ${remoteSessionId}`);
            this.sendSignal(remoteSessionId, "offer", { description: peer.localDescription });
        } catch (error) {
            console.warn("[Voice] createOffer failed for", remoteSessionId, error);
        }
    }

    async handleSignal(payload = {}) {
        if (!this.isAvailable()) return;
        const fromSessionId = String(payload.fromSessionId || "").trim();
        const targetSessionId = String(payload.targetSessionId || "").trim();
        if (!fromSessionId || fromSessionId === this.mySessionId) return;

        if (payload.kind === "state") {
            const enabled = Boolean(payload.enabled);
            debugLog(`[VOICE_DEBUG] voice:state:receive ${fromSessionId} enabled ${enabled}`);
            this.voiceEnabledBySessionId.set(fromSessionId, enabled);
            if (payload.speaking) {
                this.remoteSpeaking.set(fromSessionId, {
                    speaking: true,
                    name: String(payload.name || "").trim()
                });
            } else {
                this.remoteSpeaking.delete(fromSessionId);
            }

            if (enabled) {
                if (this.isEnabled && this.localStream && !this.peersBySessionId.has(fromSessionId)) {
                    this.connectPeer(fromSessionId);
                }
            } else {
                if (this.peersBySessionId.has(fromSessionId)) {
                    this.closePeer(fromSessionId, "remote-disabled");
                }
            }
            this.updateSpeakerUi();
            return;
        }

        if (payload.kind !== "state" && targetSessionId !== this.mySessionId) {
            const logKind = (payload.kind === "candidate" || payload.kind === "ice") ? "ice" : payload.kind;
            debugLog(`[VOICE_DEBUG] ${logKind}:receive ${fromSessionId} ${targetSessionId} ignored`);
            return;
        }

        let peer = this.peersBySessionId.get(fromSessionId);
        if (!peer && this.isEnabled && this.localStream && this.voiceEnabledBySessionId.get(fromSessionId) === true) {
            peer = this.connectPeer(fromSessionId);
        }
        if (!peer) return;

        try {
            if (payload.kind === "offer") {
                debugLog(`[VOICE_DEBUG] offer:receive ${fromSessionId} ${targetSessionId} accepted`);
                await peer.setRemoteDescription(new RTCSessionDescription(payload.description || payload.sdp));
                await this.flushQueuedCandidates(peer);
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                debugLog(`[VOICE_DEBUG] answer:send ${fromSessionId}`);
                this.sendSignal(fromSessionId, "answer", { description: peer.localDescription });
                return;
            }

            if (payload.kind === "answer") {
                debugLog(`[VOICE_DEBUG] answer:receive ${fromSessionId} ${targetSessionId} accepted`);
                await peer.setRemoteDescription(new RTCSessionDescription(payload.description || payload.sdp));
                await this.flushQueuedCandidates(peer);
                return;
            }

            if (payload.kind === "candidate" || payload.kind === "ice") {
                debugLog(`[VOICE_DEBUG] ice:receive ${fromSessionId} ${targetSessionId} accepted`);
                const candidate = payload.candidate;
                if (candidate) {
                    if (peer.remoteDescription) {
                        await peer.addIceCandidate(new RTCIceCandidate(candidate));
                    } else {
                        peer._queuedCandidates = peer._queuedCandidates || [];
                        peer._queuedCandidates.push(candidate);
                    }
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
        let audio = this.remoteAudioBySessionId.get(sessionId);
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
            document.body.appendChild(audio);
            this.remoteAudioBySessionId.set(sessionId, audio);
        }
        audio.srcObject = stream;
        
        audio.play().then(() => {
            debugLog(`[VOICE_DEBUG] audio:play:success ${sessionId}`);
            this.remoteAudioPlayback.set(sessionId, true);
            this.audioPlaybackBlocked = false;
            this.updateAudioUnlockUi();
            this.updateSpeakerUi();
        }).catch((error) => {
            this.remoteAudioPlayback.set(sessionId, false);
            this.audioPlaybackBlocked = true;
            debugLog(`[VOICE_DEBUG] audio:play:error ${sessionId} ${error?.name || error}`);
            this.updateAudioUnlockUi();
            this.updateSpeakerUi();
        });
    }

    closePeer(sessionId, reason) {
        debugLog(`[VOICE_DEBUG] peer:close ${sessionId} ${reason}`);
        const peer = this.peersBySessionId.get(sessionId);
        if (peer) {
            try { peer.close(); } catch {}
        }
        this.peersBySessionId.delete(sessionId);
        
        const audio = this.remoteAudioBySessionId.get(sessionId);
        if (audio) {
            try { audio.srcObject = null; } catch {}
            audio.remove();
        }
        this.remoteAudioBySessionId.delete(sessionId);
        this.remoteSpeaking.delete(sessionId);
        this.remoteAudioPlayback.delete(sessionId);
        if (!this.remoteAudioBySessionId.size) {
            this.audioPlaybackBlocked = false;
        }
        this.updateAudioUnlockUi();
        this.updateSpeakerUi();
    }

    resetRoom() {
        this.isEnabled = false;
        this.isSpeaking = false;
        this.statusText = "";
        this.audioPlaybackBlocked = false;
        for (const sessionId of Array.from(this.peersBySessionId.keys())) {
            this.closePeer(sessionId, "room-reset");
        }
        this.peersBySessionId.clear();
        this.remoteAudioBySessionId.clear();
        this.voiceEnabledBySessionId.clear();
        this.remoteSpeaking.clear();
        this.remoteAudioPlayback.clear();
        this.updateAudioUnlockUi();
    }

    destroy() {
        this.resetRoom();
        if (this.localAudioTrack) {
            try { this.localAudioTrack.stop(); } catch {}
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

    updateAudioUnlockUi() {
        const button = document.getElementById("voice-unlock-btn");
        if (!button) return;
        const shouldShow = this.audioPlaybackBlocked && this.isAvailable();
        button.classList.toggle("is-hidden", !shouldShow);
        const title = this.game?.t?.("voice-enable-sound") || "Enable sound";
        button.textContent = title;
        button.title = title;
        button.setAttribute("aria-label", title);
    }

    async unlockRemoteAudio() {
        const audioEntries = Array.from(this.remoteAudioBySessionId.entries());
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
                await audio.play();
                debugLog(`[VOICE_DEBUG] audio:play:success ${sessionId}`);
                this.remoteAudioPlayback.set(sessionId, true);
                unlocked = true;
            } catch (error) {
                this.remoteAudioPlayback.set(sessionId, false);
                debugLog(`[VOICE_DEBUG] audio:play:error ${sessionId} ${error?.name || error}`);
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
            
            const peer = this.peersBySessionId.get(sessionId);
            const isConn = peer && (peer.connectionState === "connected" || peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed");
            if (!isConn) continue;

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
            } else if (this.isEnabled) {
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
            const peer = this.peersBySessionId.get(sessionId);
            const isConn = peer && (peer.connectionState === "connected" || peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed");
            const isSpeaking = isConn && (this.remoteSpeaking.get(sessionId)?.speaking || false) && (this.remoteAudioPlayback.get(sessionId) !== false);
            chip.classList.toggle("speaking", isSpeaking);
        });
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
}
