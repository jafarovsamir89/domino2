// Advanced procedural sound effects using Web Audio API
const audioSettings = { masterMuted: false, musicVolume: 0.15, effectsVolume: 1 };
function validVolume(value, fallback) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }
try {
    audioSettings.masterMuted = localStorage.getItem('domino_music_muted') === 'true';
    const saved = JSON.parse(localStorage.getItem('domino_audio_settings') || 'null');
    if (saved && typeof saved === 'object') {
        if (typeof saved.masterMuted === 'boolean') audioSettings.masterMuted = saved.masterMuted;
        audioSettings.musicVolume = validVolume(saved.musicVolume, audioSettings.musicVolume);
        audioSettings.effectsVolume = validVolume(saved.effectsVolume, audioSettings.effectsVolume);
    }
} catch (_) {}
let lifecycleMuted = typeof document !== 'undefined' && document.hidden;
let ctx = null;
let effectsGain = null;
let nativeMuted = false;
let nativeAudio = null;
let nativeAudioReady = null;
const effectsEnabled = () => !audioSettings.masterMuted && !lifecycleMuted && !nativeMuted && audioSettings.effectsVolume > 0;
export function getAudioSettings() { return { ...audioSettings }; }
export function updateAudioSettings(patch = {}) {
    if (typeof patch.masterMuted === 'boolean') audioSettings.masterMuted = patch.masterMuted;
    audioSettings.musicVolume = validVolume(patch.musicVolume, audioSettings.musicVolume);
    audioSettings.effectsVolume = validVolume(patch.effectsVolume, audioSettings.effectsVolume);
    try {
        localStorage.setItem('domino_audio_settings', JSON.stringify(audioSettings));
        localStorage.setItem('domino_music_muted', String(audioSettings.masterMuted));
    } catch (_) {}
    applyAudioState();
    syncNativeAudio();
    return getAudioSettings();
}
function applyAudioState() {
    if (effectsGain) effectsGain.gain.value = effectsEnabled() ? audioSettings.effectsVolume : 0;
    if (currentAudio) {
        currentAudio.volume = audioSettings.musicVolume;
        if (audioSettings.masterMuted || lifecycleMuted || nativeMuted || audioSettings.musicVolume === 0) currentAudio.pause();
        else if (currentMusicMode && currentAudio.paused) currentAudio.play().catch(error => {
            console.warn(currentMusicMode === 'menu' ? 'Menu music autoplay prevented, waiting for interaction' : 'Game music autoplay prevented, waiting for interaction', error);
        });
    }
}
function syncLifecycleAudio() {
    lifecycleMuted = document.hidden;
    if (lifecycleMuted && ctx) ctx.suspend().catch(() => {});
    applyAudioState();
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', syncLifecycleAudio);
window.addEventListener?.('pagehide', () => { lifecycleMuted = true; if (ctx) ctx.suspend().catch(() => {}); applyAudioState(); });
window.addEventListener?.('pageshow', syncLifecycleAudio);
function acceptNativeAudioState(state) {
    nativeMuted = !state.active;
    if (nativeMuted && ctx) ctx.suspend().catch(() => {});
    applyAudioState();
}
function syncNativeAudio() {
    if (!nativeAudioReady) return;
    nativeAudioReady.then(() => nativeAudio.configure({ enabled: !audioSettings.masterMuted &&
        (audioSettings.musicVolume > 0 || audioSettings.effectsVolume > 0) })).then(acceptNativeAudioState).catch(() => {});
}
// Older installed builds have no custom audio bridge; browser lifecycle still works.
try {
    const cap = window.Capacitor;
    if (cap?.isNativePlatform?.() && cap.isPluginAvailable?.('DominoAudio')) {
        nativeMuted = true;
        nativeAudio = cap.registerPlugin?.('DominoAudio') || cap.Plugins?.DominoAudio;
        if (!nativeAudio) throw new Error('Native audio bridge unavailable');
        nativeAudioReady = Promise.resolve(nativeAudio.addListener('stateChange', acceptNativeAudioState));
        syncNativeAudio();
    }
} catch (_) { nativeMuted = false; }

let noiseBuffer = null;
let fallbackNoiseSeed = (Date.now() ^ Math.floor((window.performance?.now?.() || 0) * 1000)) >>> 0;

function nextFallbackNoiseValue() {
    fallbackNoiseSeed = (1664525 * fallbackNoiseSeed + 1013904223) >>> 0;
    return (fallbackNoiseSeed / 0x80000000) - 1;
}

function getCtx() {
    if (!effectsEnabled()) return null;
    try {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return null;
        if (!ctx) {
            ctx = new AudioCtor();
            effectsGain = ctx.createGain();
            effectsGain.gain.value = audioSettings.effectsVolume;
            effectsGain.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) {
        return null;
    }
    return ctx;
}

function fillNoiseRandomValues(target) {
    if (!target) return false;
    if (!window.crypto?.getRandomValues) return false;
    try {
        const maxChunkLength = 16384;
        for (let offset = 0; offset < target.length; offset += maxChunkLength) {
            const slice = target.subarray(offset, Math.min(target.length, offset + maxChunkLength));
            window.crypto.getRandomValues(slice);
        }
    } catch (error) {
        return false;
    }
    return true;
}

function getNoiseBuffer() {
    const c = getCtx();
    if (!c) return null;
    if (!noiseBuffer) {
        noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        const randomValues = new Uint32Array(data.length);
        const hasCryptoNoise = fillNoiseRandomValues(randomValues);
        for (let i = 0; i < data.length; i++) {
            data[i] = hasCryptoNoise ? (randomValues[i] / 0x80000000) - 1 : nextFallbackNoiseValue();
        }
    }
    return noiseBuffer;
}

function playClack(freq = 150, noiseVol = 0.3, oscVol = 0.2, dur = 0.1) {
    try {
        const c = getCtx();
        if (!c) return;
        if (c.state === 'suspended') c.resume();
        const now = c.currentTime;

        // 1. Impact Noise (the "click")
        const noise = c.createBufferSource();
        const buffer = getNoiseBuffer();
        if (!buffer) return;
        noise.buffer = buffer;
        const noiseFilter = c.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1200;
        const noiseGain = c.createGain();
        noiseGain.gain.setValueAtTime(noiseVol, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        // 2. Body resonance (the "thud")
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        const oscGain = c.createGain();
        oscGain.gain.setValueAtTime(oscVol, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        noise.connect(noiseFilter).connect(noiseGain).connect(effectsGain);
        osc.connect(oscGain).connect(effectsGain);

        noise.start(now); noise.stop(now + 0.05);
        osc.start(now); osc.stop(now + dur);
    } catch (e) {}
}

export function sndPlace() {
    if (!effectsEnabled()) return;
    playClack(180, 0.6, 0.4, 0.07); // Louder, sharper clack
    setTimeout(() => playClack(140, 0.2, 0.1, 0.05), 30); // Subtle secondary bounce
}

export function sndScore() { 
    try {
        const c = getCtx();
        if (!c) return;
        if (c.state === 'suspended') c.resume();
        const now = c.currentTime;
        const notes = [660, 880, 1100];
        notes.forEach((f, i) => {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.connect(g).connect(effectsGain);
            osc.frequency.setValueAtTime(f, now + i * 0.07);
            g.gain.setValueAtTime(0.3, now + i * 0.07); // Louder
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
            osc.start(now + i * 0.07); osc.stop(now + i * 0.07 + 0.25);
        });
    } catch (e) {}
}

export function sndDraw() { 
    try {
        const c = getCtx();
        if (!c) return;
        const now = c.currentTime;
        const noise = c.createBufferSource();
        const buffer = getNoiseBuffer();
        if (!buffer) return;
        noise.buffer = buffer;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(500, now + 0.2);
        const g = c.createGain();
        g.gain.setValueAtTime(0.2, now); // Louder
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        noise.connect(filter).connect(g).connect(effectsGain);
        noise.start(now); noise.stop(now + 0.2);
    } catch(e) {}
}

export function sndPass() { 
    playClack(90, 0.2, 0.2, 0.15); // Louder thud
}

export function sndWin() { 
    try {
        const c = getCtx();
        if (!c) return;
        const now = c.currentTime;
        const melody = [523, 659, 784, 1047];
        melody.forEach((f, i) => {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'triangle';
            osc.connect(g).connect(effectsGain);
            osc.frequency.setValueAtTime(f, now + i * 0.1);
            g.gain.setValueAtTime(0.3, now + i * 0.1); // Louder
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
            osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.4);
        });
    } catch (e) {}
}

export function sndGosha() {
    if (!effectsEnabled()) return;
    sndScore();
    setTimeout(() => playClack(200, 0.7, 0.4, 0.12), 80);
}

// Background Music Controller
let currentAudio = null;
let currentPlaylist = [];
let currentPlaylistIndex = -1;
let currentMusicMode = null; // 'menu' or 'game'

export function isMuted() { return audioSettings.masterMuted; }

export function startMenuMusic() {
    if (currentMusicMode === 'menu' && currentAudio && !currentAudio.paused) {
        return;
    }
    stopMusic();
    currentMusicMode = 'menu';
    
    currentAudio = new Audio('assets/sounds/menu music/Majestic Menu Lounge.mp3');
    currentAudio.loop = true;
    currentAudio.volume = audioSettings.musicVolume;
    
    applyAudioState();
}

function playGameTrack() {
    if (currentPlaylistIndex < 0 || currentPlaylistIndex >= currentPlaylist.length) {
        currentPlaylistIndex = 0;
    }
    const src = currentPlaylist[currentPlaylistIndex];
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = src;
    } else {
        currentAudio = new Audio(src);
    }
    currentAudio.loop = false;
    currentAudio.volume = audioSettings.musicVolume;
    
    currentAudio.onended = () => {
        if (currentMusicMode === 'game') {
            currentPlaylistIndex = (currentPlaylistIndex + 1) % currentPlaylist.length;
            playGameTrack();
        }
    };
    
    applyAudioState();
}

export function startGameMusic() {
    if (currentMusicMode === 'game' && currentAudio && !currentAudio.paused) {
        return;
    }
    stopMusic();
    currentMusicMode = 'game';
    
    currentPlaylist = [
        'assets/sounds/playlist game/Baku Breeze Lounge.mp3',
        'assets/sounds/playlist game/Legacy of the Tiles.mp3'
    ];
    currentPlaylistIndex = 0;
    
    playGameTrack();
}

export function nextTrack() {
    if (currentMusicMode !== 'game' || currentPlaylist.length === 0) return;
    currentPlaylistIndex = (currentPlaylistIndex + 1) % currentPlaylist.length;
    playGameTrack();
}

export function stopMusic() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.onended = null;
        currentAudio = null;
    }
    currentMusicMode = null;
}

export function toggleMute() {
    return updateAudioSettings({ masterMuted: !audioSettings.masterMuted }).masterMuted;
}
