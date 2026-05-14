const DEFAULT_ICE_SERVERS = [
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["stun:global.stun.twilio.com:3478?transport=udp"] }
];

function supportsVoiceChat() {
    return typeof RTCPeerConnection !== "undefined"
        && typeof RTCIceCandidate !== "undefined"
        && typeof RTCSessionDescription !== "undefined"
        && typeof navigator !== "undefined"
        && Boolean(navigator.mediaDevices?.getUserMedia);
}

export class VoiceChatManager {
    constructor(game) {
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
        this.roomState = roomState;
        this.syncVisibility();
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
            this.ensurePeer(sessionId);
        }
        this.updateSpeakerUi();
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
        } else if (!this.statusText) {
            this.setStatus(this.game?.t?.("voice-ready") || "Voice ready");
        }
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

    async startSpeaking() {
        if (this.destroyed || !this.isAvailable()) return false;
        if (!this.localStream) {
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
                    this.localAudioTrack.enabled = false;
                }
                this.attachLocalTrackToPeers();
                this.setStatus(this.game?.t?.("voice-ready") || "Voice ready");
            } catch (error) {
                console.warn("[Voice] Microphone access failed:", error);
                this.setStatus(this.game?.t?.("voice-denied") || "Microphone access denied");
                this.game?.renderer?.showMessage?.(this.game?.t?.("voice-denied") || "Microphone access denied", 2200);
                return false;
            }
        }

        this.isEnabled = true;
        this.isSpeaking = true;
        if (this.localAudioTrack) this.localAudioTrack.enabled = true;
        this.updateLocalSpeakingUi(true);
        this.broadcastSpeakingState(true);
        this.setStatus(this.game?.t?.("voice-speaking") || "Speaking");
        return true;
    }

    stopSpeaking() {
        if (this.destroyed) return;
        this.isSpeaking = false;
        if (this.localAudioTrack) this.localAudioTrack.enabled = false;
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
        this.updateLocalSpeakingUi(false);
        for (const sessionId of Array.from(this.peerConnections.keys())) {
            this.closePeer(sessionId);
        }
        this.clearRemoteSpeaking();
    }

    destroy() {
        this.stopSpeaking();
        this.resetRoom();
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

    updateSpeakerUi() {
        const activeNames = [];
        const players = Array.isArray(this.roomState?.players) ? this.roomState.players : [];
        const playerBySession = new Map(players.map((player) => [String(player.sessionId || ""), player]));
        for (const [sessionId, state] of this.remoteSpeaking.entries()) {
            if (!state?.speaking) continue;
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
            chip.classList.toggle("speaking", this.remoteSpeaking.get(sessionId)?.speaking || false);
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
            sender.replaceTrack(this.localAudioTrack).catch((error) => {
                console.warn("[Voice] replaceTrack failed for", sessionId, error);
            });
        }
    }

    ensurePeer(remoteSessionId) {
        const targetSessionId = String(remoteSessionId || "").trim();
        if (!targetSessionId || targetSessionId === this.mySessionId) return null;

        let peer = this.peerConnections.get(targetSessionId);
        if (peer) return peer;

        peer = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
        this.peerConnections.set(targetSessionId, peer);

        const transceiver = peer.addTransceiver("audio", { direction: "sendrecv" });
        this.peerSenders.set(targetSessionId, transceiver.sender);

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal(targetSessionId, "candidate", { candidate: event.candidate });
            }
        };

        peer.ontrack = (event) => {
            const stream = event.streams?.[0] || null;
            if (stream) this.attachRemoteStream(targetSessionId, stream);
        };

        peer.onconnectionstatechange = () => {
            if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
                const isStale = !this.getRemoteHumanSessions().includes(targetSessionId);
                if (isStale || peer.connectionState === "failed") {
                    this.closePeer(targetSessionId);
                }
            }
        };

        peer.oniceconnectionstatechange = () => {
            if (["failed", "closed"].includes(peer.iceConnectionState)) {
                this.closePeer(targetSessionId);
            }
        };

        if (this.localAudioTrack) {
            transceiver.sender.replaceTrack(this.localAudioTrack).catch((error) => {
                console.warn("[Voice] initial replaceTrack failed:", error);
            });
        }

        if (this.shouldInitiate(targetSessionId)) {
            void this.startOffer(targetSessionId);
        }

        return peer;
    }

    shouldInitiate(remoteSessionId) {
        const mine = String(this.mySessionId || "");
        const remote = String(remoteSessionId || "");
        return !!mine && !!remote && mine < remote;
    }

    async startOffer(remoteSessionId) {
        const peer = this.peerConnections.get(remoteSessionId);
        if (!peer || peer.signalingState !== "stable") return;
        try {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            this.sendSignal(remoteSessionId, "offer", { description: peer.localDescription });
        } catch (error) {
            console.warn("[Voice] offer failed:", error);
        }
    }

    async handleSignal(payload = {}) {
        if (!this.isAvailable()) return;
        const fromSessionId = String(payload.fromSessionId || "").trim();
        const targetSessionId = String(payload.targetSessionId || "").trim();
        if (!fromSessionId || fromSessionId === this.mySessionId) return;
        if (targetSessionId && targetSessionId !== this.mySessionId) return;

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
        }

        const peer = this.ensurePeer(fromSessionId);
        if (!peer) return;

        const description = payload.description || payload.sdp || null;
        const candidate = payload.candidate || null;

        try {
            if (payload.kind === "offer" && description) {
                await peer.setRemoteDescription(new RTCSessionDescription(description));
                await this.flushQueuedCandidates(peer);
                if (this.localAudioTrack) {
                    const sender = this.peerSenders.get(fromSessionId);
                    if (sender && sender.track !== this.localAudioTrack) {
                        await sender.replaceTrack(this.localAudioTrack);
                    }
                }
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                this.sendSignal(fromSessionId, "answer", { description: peer.localDescription });
                return;
            }

            if (payload.kind === "answer" && description) {
                if (peer.currentRemoteDescription) return;
                await peer.setRemoteDescription(new RTCSessionDescription(description));
                await this.flushQueuedCandidates(peer);
                return;
            }

            if (payload.kind === "candidate" && candidate) {
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
            audio.autoplay = true;
            audio.playsInline = true;
            audio.preload = "none";
            audio.className = "voice-remote-audio";
            audio.dataset.sessionId = sessionId;
            audio.style.display = "none";
            document.body.appendChild(audio);
            this.remoteAudioElements.set(sessionId, audio);
        }
        audio.srcObject = stream;
        audio.play().catch(() => {});
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
        this.updateSpeakerUi();
    }
}
