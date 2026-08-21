// Sound effects for key events (feedback #17). Defaults are SYNTHESIZED with the
// Web Audio API — no asset files, works offline. Users can override any event
// with their own uploaded audio (stored as a data-URL in localStorage), and set
// a master on/off + volume. Never throws: audio is best-effort.

export type SoundEvent =
  | "questComplete"
  | "levelUp"
  | "achievement"
  | "focusStart"
  | "focusEnd";

export const SOUND_EVENTS: SoundEvent[] = [
  "questComplete",
  "levelUp",
  "achievement",
  "focusStart",
  "focusEnd",
];

interface SoundConfig {
  enabled: boolean;
  volume: number; // 0..1
  custom: Partial<Record<SoundEvent, string>>; // event -> data URL
}

const KEY = "qf.sound";

function load(): SoundConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SoundConfig>;
      return {
        enabled: parsed.enabled ?? true,
        volume: typeof parsed.volume === "number" ? parsed.volume : 0.6,
        custom: parsed.custom ?? {},
      };
    }
  } catch {
    /* ignore */
  }
  return { enabled: true, volume: 0.6, custom: {} };
}

let config = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

// Short note sequences (freq in Hz, start offset & duration in seconds).
const NOTES: Record<SoundEvent, [number, number, number][]> = {
  questComplete: [
    [523, 0, 0.12],
    [659, 0.1, 0.16],
  ],
  levelUp: [
    [523, 0, 0.12],
    [659, 0.12, 0.12],
    [784, 0.24, 0.12],
    [1046, 0.36, 0.22],
  ],
  achievement: [
    [784, 0, 0.12],
    [1046, 0.12, 0.22],
  ],
  focusStart: [[440, 0, 0.16]],
  focusEnd: [
    [659, 0, 0.14],
    [523, 0.14, 0.2],
  ],
};

function playSynth(event: SoundEvent) {
  const ac = ctx();
  if (!ac) return;
  const now = ac.currentTime;
  for (const [freq, start, dur] of NOTES[event]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const peak = 0.18 * config.volume;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(peak, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  }
}

export const soundService = {
  getConfig(): SoundConfig {
    return { ...config, custom: { ...config.custom } };
  },
  setEnabled(enabled: boolean) {
    config = { ...config, enabled };
    save();
  },
  setVolume(volume: number) {
    config = { ...config, volume: Math.max(0, Math.min(1, volume)) };
    save();
  },
  setCustom(event: SoundEvent, dataUrl: string | null) {
    const custom = { ...config.custom };
    if (dataUrl) custom[event] = dataUrl;
    else delete custom[event];
    config = { ...config, custom };
    save();
  },
  hasCustom(event: SoundEvent): boolean {
    return !!config.custom[event];
  },
  play(event: SoundEvent) {
    if (!config.enabled) return;
    const custom = config.custom[event];
    if (custom) {
      try {
        const audio = new Audio(custom);
        audio.volume = config.volume;
        void audio.play().catch(() => {});
        return;
      } catch {
        /* fall through to synth */
      }
    }
    playSynth(event);
  },
};
