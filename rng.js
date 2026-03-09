export function makeRng(seed = 1) {
  // Mulberry32
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function choice(arr, rand) {
  return arr[Math.floor(rand()*arr.length)];
}
export function shuffle(arr, rand) {
  for (let i=arr.length-1;i>0;i--){
    const j=Math.floor(rand()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
