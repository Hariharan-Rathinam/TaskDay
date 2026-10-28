// Sounds generated with WebAudio (no audio files needed): completion ding, alarms, white noise.
let ctx = null;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, vol = 0.2, type = 'sine') {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
}

export function playComplete() { tone(880, 0, 0.12, 0.12); tone(1320, 0.07, 0.25, 0.1); }
export function playAlarm(kind = 'bell') {
  if (kind === 'none') return;
  if (kind === 'digital') { for (let i = 0; i < 6; i++) tone(1000, i * 0.25, 0.12, 0.15, 'square'); return; }
  if (kind === 'soft') { tone(523, 0, 0.6, 0.15); tone(659, 0.3, 0.6, 0.15); tone(784, 0.6, 0.9, 0.15); return; }
  for (let i = 0; i < 3; i++) { tone(1046, i * 0.7, 1.2, 0.18); tone(1568, i * 0.7 + 0.02, 0.9, 0.08); }
}
export function playReminder() { tone(988, 0, 0.18, 0.15); tone(1319, 0.2, 0.35, 0.15); }

// ---------- white noise ----------
let noise = null;
export const NOISES = { off: 'Off', white: 'White noise', pink: 'Pink noise', brown: 'Brown noise', rain: 'Rain', ocean: 'Ocean waves', clock: 'Ticking clock', cafe: 'Café murmur' };

function noiseBuffer(a, kind) {
  const len = a.sampleRate * 4;
  const buf = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.35;
      else if (kind === 'pink' || kind === 'rain' || kind === 'cafe') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    }
    // crossfade loop edges to avoid clicks
    const fade = 2000;
    for (let i = 0; i < fade; i++) { const k = i / fade; d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k; }
  }
  return buf;
}

export function setNoise(kind, volume = 0.5) {
  stopNoise();
  if (!kind || kind === 'off') return;
  const a = ac(); if (!a) return;
  const master = a.createGain(); master.gain.value = volume; master.connect(a.destination);
  const nodes = [master];
  if (kind === 'clock') {
    let t = a.currentTime + 0.1;
    const id = setInterval(() => {
      while (t < a.currentTime + 1) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'square'; o.frequency.value = 2400;
        g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        o.connect(g).connect(master); o.start(t); o.stop(t + 0.04); t += 1;
      }
    }, 300);
    noise = { stop: () => { clearInterval(id); master.disconnect(); }, master };
    return;
  }
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, kind === 'ocean' ? 'brown' : kind);
  src.loop = true;
  let out = src;
  if (kind === 'rain') {
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    out.connect(hp); hp.connect(lp); out = lp; nodes.push(hp, lp);
  }
  if (kind === 'cafe') {
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
    out.connect(bp); out = bp; nodes.push(bp);
  }
  if (kind === 'ocean') {
    const g = a.createGain(); g.gain.value = 0.5;
    const lfo = a.createOscillator(); lfo.frequency.value = 0.09;
    const lg = a.createGain(); lg.gain.value = 0.45;
    lfo.connect(lg).connect(g.gain); lfo.start();
    out.connect(g); out = g; nodes.push(g, lfo);
  }
  out.connect(master);
  src.start();
  noise = { stop: () => { try { src.stop(); } catch { /* ignore */ } nodes.forEach((n) => { try { n.disconnect(); if (n.stop) n.stop(); } catch { /* ignore */ } }); }, master };
}
export function setNoiseVolume(v) { if (noise?.master) noise.master.gain.value = v; }
export function stopNoise() { if (noise) { noise.stop(); noise = null; } }
export function unlockAudio() { ac(); }
