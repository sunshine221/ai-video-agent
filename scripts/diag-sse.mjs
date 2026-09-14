// 流式读取运行中 dev 服务器的 /api/frames/html SSE，打印每个事件
const uuid = 'a8651191-6d90-4703-b45c-c87af027d303';
const base = process.argv[2] || 'http://localhost:3000';
console.log('POST', base + '/api/frames/html', 'projectId=', uuid);

const t0 = Date.now();
const res = await fetch(base + '/api/frames/html', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ projectId: uuid }),
});
console.log('HTTP', res.status);
if (!res.ok) { console.log(await res.text()); process.exit(1); }

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const parts = buf.split('\n\n');
  buf = parts.pop() || '';
  for (const p of parts) {
    const ev = p.match(/event: (.+)/)?.[1];
    const data = p.match(/data: (.+)/)?.[1];
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[+${sec}s] ${ev} ${data || ''}`);
  }
}
console.log('流结束，总耗时', ((Date.now() - t0) / 1000).toFixed(1), 's');
