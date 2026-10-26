// Seeded, serializable PRNG (mulberry32). Every random decision in a run
// draws from an RNG whose state is part of the saved run, so a reload
// continues the same sequence instead of rerolling.
export function createRng(seed) {
  let state = seed >>> 0;
  const rng = {
    next() {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) { return min + Math.floor(rng.next() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    getState() { return state; },
    setState(s) { state = s >>> 0; }
  };
  return rng;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
