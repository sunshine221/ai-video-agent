// 释放指定端口：杀掉正在监听该端口的进程。跨平台（Windows / macOS / Linux）。
// 用法：node scripts/free-port.mjs 3000
import { execSync } from 'node:child_process';

const port = process.argv[2] || '3000';
const isWin = process.platform === 'win32';

function findPids(p) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split('\n')) {
        // 只匹配 LISTENING 且本地端口等于目标端口的行
        if (!/LISTENING/i.test(line)) continue;
        const m = line.trim().match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (m && m[1] === String(p)) pids.add(m[2]);
      }
      return [...pids];
    } else {
      const out = execSync(`lsof -ti tcp:${p} -s tcp:LISTEN`, { encoding: 'utf8' });
      return out.split('\n').map(s => s.trim()).filter(Boolean);
    }
  } catch {
    return [];
  }
}

const pids = findPids(port);
if (pids.length === 0) {
  console.log(`[free-port] 端口 ${port} 空闲，无需处理`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (isWin) execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
    else execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    console.log(`[free-port] 已释放端口 ${port}（结束进程 PID ${pid}）`);
  } catch (e) {
    console.warn(`[free-port] 无法结束进程 PID ${pid}：${e.message}`);
  }
}
