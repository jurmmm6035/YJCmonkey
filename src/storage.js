// Local replacement for Claude Artifacts' window.storage API.
// Same shape (get/set/delete/list), but backed by the device's localStorage
// via Capacitor's WebView, so the app works fully standalone (no Claude account,
// no network required).
//
// NOTE: The `shared` parameter from window.storage doesn't apply here since
// there's no multi-user backend in a standalone app — every key is local to
// this device/install. It's kept in the signature so the rest of the app
// code (copied from the Claude Artifact) doesn't need to change.

const PREFIX = "reaction-calc:";

function read(key) {
  const raw = localStorage.getItem(PREFIX + key);
  if (raw === null) return null;
  return { key, value: raw, shared: false };
}

const storage = {
  async get(key, _shared = false) {
    const result = read(key);
    if (result === null) {
      // window.storage throws on a missing key rather than returning null —
      // callers in the app already wrap this in try/catch.
      throw new Error(`Key not found: ${key}`);
    }
    return result;
  },

  async set(key, value, _shared = false) {
    localStorage.setItem(PREFIX + key, value);
    return { key, value, shared: false };
  },

  async delete(key, _shared = false) {
    const existed = localStorage.getItem(PREFIX + key) !== null;
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: existed, shared: false };
  },

  async list(prefix = "", _shared = false) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (fullKey && fullKey.startsWith(PREFIX)) {
        const shortKey = fullKey.slice(PREFIX.length);
        if (shortKey.startsWith(prefix)) keys.push(shortKey);
      }
    }
    return { keys, prefix, shared: false };
  },
};

// Install on window so App.jsx (copied straight from the Claude Artifact)
// can keep calling `window.storage.*` without any changes.
if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;
