// 模拟「用户离开页面」：建立 SSE，收到第一个 progress 后立刻断开 fetch。
// 预期：后台任务不受影响，继续把三帧写库。
const uuid = 'a8651191-6d90-4703-b45c-c87af027d303';
const base = 'http://localhost:3000';
const ctrl = new AbortController();

const t0 = Date.now();
const res = await fetch(base + '/api/frames/html', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ projectId: uuid }),
  signal: ctrl.signal,
});
console.log('HTTP', res.status);
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let progressCount = 0;
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const p of parts) {
      const ev = p.match(/event: (.+)/)?.[1];
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[+${sec}s] ${ev}`);
      if (ev === 'progress') {
        progressCount++;
        if (progressCount === 1) {
          console.log('>>> 模拟用户离开：立即断开 fetch 连接');
          ctrl.abort();
        }
      }
    }
  }
} catch (e) {
  console.log('fetch 已断开:', e.name);
}
console.log('客户端已断开，后台任务应继续运行。');
