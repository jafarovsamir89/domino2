// Advanced procedural sound effects using Web Audio API
let ctx = null;
let noiseBuffer = null;

function getCtx() {
    try {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return null;
        if (!ctx) ctx = new AudioCtor();
    } catch (e) {
        return null;
    }
    return ctx;
}

function getNoiseBuffer() {
    const c = getCtx();
    if (!c) return null;
    if (!noiseBuffer) {
        noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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

        noise.connect(noiseFilter).connect(noiseGain).connect(c.destination);
        osc.connect(oscGain).connect(c.destination);

        noise.start(now); noise.stop(now + 0.05);
        osc.start(now); osc.stop(now + dur);
    } catch (e) {}
}

export function sndPlace() { 
    playClack(180, 0.6, 0.4, 0.07); // Louder, sharper clack
    setTimeout(() => playClack(140, 0.2, 0.1, 0.05), 30); // Subtle secondary bounce
}

export function sndScore() { 
    try {
        const c = getCtx();
        if (!c) return;
        const now = c.currentTime;
        const notes = [660, 880, 1100];
        notes.forEach((f, i) => {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.connect(g).connect(c.destination);
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
        noise.connect(filter).connect(g).connect(c.destination);
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
            osc.connect(g).connect(c.destination);
            osc.frequency.setValueAtTime(f, now + i * 0.1);
            g.gain.setValueAtTime(0.3, now + i * 0.1); // Louder
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
            osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.4);
        });
    } catch (e) {}
}

export function sndGosha() { 
    sndScore();
    setTimeout(() => playClack(200, 0.7, 0.4, 0.12), 80);
}
