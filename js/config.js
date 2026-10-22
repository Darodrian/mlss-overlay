// Shared configuration between the dashboard and the overlay.
// The Supabase project is the same one the other overlays use; the publishable
// key is client-side by design (each room is keyed by an unguessable key).
export const SUPABASE_URL = 'https://liuhcwkpuivcletiwpab.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_YenbmLGW94t6XHVXgZx0DQ_e2XjL6tC';

export const CHANNEL_STORE = 'mlss_channel';
export const PREVIEW_MUTE_STORE = 'mlss_preview_muted';

const norm = (v) => String(v ?? '').trim().toLowerCase();

export const keyStore = (channel) => `mlss_key_${norm(channel)}`;
export const cfgStore = (channel) => `mlss_cfg_${norm(channel)}`;
export const liveCfgStore = (channel) => `mlss_livecfg_${norm(channel)}`;

export const ENTRANCE_SIDES = ['left', 'right'];

export const DEFAULT_SETTINGS = {
  entranceSide: 'left',
  permissions: {
    everyone: true,
    broadcaster: true,
    mod: true,
    vip: true,
    subscriber: true,
  },
  userCooldownMs: 30_000,
  minGapMs: 1_200,
  maxLength: 120,
};
