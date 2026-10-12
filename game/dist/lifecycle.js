// This module works independently of WebGL and Bluetooth initialization.
let client = crypto.randomUUID(), config, ended = false, heartbeat;
const endpoint = '/__game_lifecycle';
const body = action => JSON.stringify({ token: config.token, client, action });
const post = action => fetch(endpoint, { method: 'POST', body: body(action), keepalive: true }).catch(() => {});

async function join() {
  const documentClient = client;
  try {
    config ??= await (await fetch(endpoint, { cache: 'no-store' })).json();
    if (ended || client !== documentClient || !config.enabled) return;
    await post('join');
    if (ended || client !== documentClient) return;
    clearInterval(heartbeat);
    heartbeat = setInterval(() => { if (!ended) void post('heartbeat'); }, 10000);
  } catch { /* A manually hosted game can operate without lifecycle endpoints. */ }
}
function leave() {
  if (ended) return;
  ended = true; clearInterval(heartbeat);
  if (!config?.enabled) return;
  if (!navigator.sendBeacon(endpoint, body('leave'))) void post('leave');
}
window.addEventListener('beforeunload', leave);
window.addEventListener('pagehide', leave);
window.addEventListener('pageshow', event => {
  if (event.persisted) { client = crypto.randomUUID(); ended = false; void join(); }
});
void join();
