/**
 * 全局 AbortController 注册表
 * key = `${projectId}:${kind}`，value = AbortController
 * 用于在生成过程中支持用户点击"中断生成"。
 */

type Kind = 'image' | 'html';

const registry = new Map<string, AbortController>();

function key(projectId: string, kind: Kind) {
  return `${projectId}:${kind}`;
}

export function getOrCreate(projectId: string, kind: Kind): AbortController {
  const k = key(projectId, kind);
  if (!registry.has(k)) {
    registry.set(k, new AbortController());
  }
  return registry.get(k)!;
}

export function abort(projectId: string, kind: Kind): boolean {
  const k = key(projectId, kind);
  const c = registry.get(k);
  if (c) {
    c.abort();
    registry.delete(k);
    return true;
  }
  return false;
}

export function clear(projectId: string, kind: Kind) {
  registry.delete(key(projectId, kind));
}

export function isAborted(projectId: string, kind: Kind): boolean {
  const c = registry.get(key(projectId, kind));
  return c?.signal.aborted ?? false;
}
