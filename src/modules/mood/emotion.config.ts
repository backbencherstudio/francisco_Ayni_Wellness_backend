
export interface EmotionDefinition {
  key: string;          // canonical key used in storage & APIs
  label: string;        // human readable label for UI
  valence: 'positive' | 'negative' | 'neutral';
  intensity: 1 | 2 | 3; // coarse perceived intensity for heuristics
}

export const EMOTION_CONFIG_VERSION = 1; // bump if ordering/semantics change

export const EMOTIONS: EmotionDefinition[] = [
  { key: 'peaceful',     label: 'Peaceful',     valence: 'positive', intensity: 1 },
  { key: 'grateful',     label: 'Grateful',     valence: 'positive', intensity: 1 },
  { key: 'energetic',    label: 'Energetic',    valence: 'positive', intensity: 2 },
  { key: 'focused',      label: 'Focused',      valence: 'positive', intensity: 1 },
  { key: 'calm',         label: 'Calm',         valence: 'positive', intensity: 1 },
  { key: 'hopeful',      label: 'Hopeful',      valence: 'positive', intensity: 1 },
  { key: 'anxious',      label: 'Anxious',      valence: 'negative', intensity: 2 },
  { key: 'tired',        label: 'Tired',        valence: 'negative', intensity: 1 },
  { key: 'stressed',     label: 'Stressed',     valence: 'negative', intensity: 2 },
  { key: 'overwhelmed',  label: 'Overwhelmed',  valence: 'negative', intensity: 3 },
  { key: 'frustrated',   label: 'Frustrated',   valence: 'negative', intensity: 2 },
  { key: 'excited',      label: 'Excited',      valence: 'positive', intensity: 2 },
  { key: 'creative',     label: 'Creative',     valence: 'positive', intensity: 2 },
  { key: 'motivated',    label: 'Motivated',    valence: 'positive', intensity: 2 },
  { key: 'relaxed',      label: 'Relaxed',      valence: 'positive', intensity: 1 },
  { key: 'inspired',     label: 'Inspired',     valence: 'positive', intensity: 2 },
  { key: 'content',      label: 'Content',      valence: 'positive', intensity: 1 },
  { key: 'sad',          label: 'Sad',          valence: 'negative', intensity: 2 },
  { key: 'happy',        label: 'Happy',        valence: 'positive', intensity: 2 },
  { key: 'angry',        label: 'Angry',        valence: 'negative', intensity: 2 },
  { key: 'lonely',       label: 'Lonely',       valence: 'negative', intensity: 2 },
];

export const EMOTION_KEYS = EMOTIONS.map(e => e.key);

// Fast lookup maps (optional future usage)
export const EMOTION_MAP: Record<string, EmotionDefinition> = EMOTIONS.reduce((acc,e)=>{ acc[e.key]=e; return acc;}, {} as Record<string, EmotionDefinition>);
