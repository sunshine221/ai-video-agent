/**
 * 生成任务管理器
 *
 * 目的：把「生成任务」的生命周期与「HTTP 请求/SSE 连接」解耦。
 * - 任务在服务端后台独立运行，不随客户端断开而中止；
 * - SSE 连接只是「观察者」，断开只取消观察，不影响任务；
 * - 事件被缓冲，观察者接入时可回放已发生的进度；
 * - 只有显式调用 abortJob（用户点「中断生成」）才会真正停止任务。
 *
 * 依赖 Node 运行时（非 edge）：模块级 Map 持有任务引用，保证请求返回后后台 Promise 继续执行。
 */

type Kind = 'image' | 'html' | 'export';

export interface JobEvent {
  event: string;
  data: unknown;
}

type Subscriber = (ev: JobEvent) => void;

/** 传给生成逻辑的发射器：写入事件缓冲并通知所有观察者 */
export type Emit = (event: string, data: unknown) => void;

/** 生成逻辑：接收 emit 与中断信号，完成即 resolve */
export type Runner = (emit: Emit, signal: AbortSignal) => Promise<void>;

interface Job {
  id: string;
  status: 'running' | 'done' | 'aborted' | 'error';
  events: JobEvent[];
  subscribers: Set<Subscriber>;
  controller: AbortController;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

// 任务完成后保留一段时间，方便晚到的观察者拿到最终状态后再清理
const RETAIN_AFTER_DONE_MS = 60_000;

const jobs = new Map<string, Job>();

function key(projectId: string, kind: Kind) {
  return `${projectId}:${kind}`;
}

/** 是否存在正在运行的任务 */
export function getRunningJob(projectId: string, kind: Kind): Job | undefined {
  const job = jobs.get(key(projectId, kind));
  return job && job.status === 'running' ? job : undefined;
}

export function getJob(projectId: string, kind: Kind): Job | undefined {
  return jobs.get(key(projectId, kind));
}

/**
 * 启动任务。若已有同 key 的运行中任务，则直接复用（不重复启动），返回该任务。
 * 生成逻辑在后台独立执行，与调用方的请求生命周期无关。
 */
export function startJob(projectId: string, kind: Kind, runner: Runner): Job {
  const k = key(projectId, kind);
  const existing = jobs.get(k);
  if (existing && existing.status === 'running') {
    return existing; // 复用运行中的任务，避免重复生成
  }
  // 清掉已结束的旧任务，重新开始
  if (existing?.cleanupTimer) clearTimeout(existing.cleanupTimer);

  const job: Job = {
    id: k,
    status: 'running',
    events: [],
    subscribers: new Set(),
    controller: new AbortController(),
  };
  jobs.set(k, job);

  const emit: Emit = (event, data) => {
    const ev: JobEvent = { event, data };
    job.events.push(ev);
    for (const sub of job.subscribers) {
      try {
        sub(ev);
      } catch {
        // 单个观察者异常不影响任务与其他观察者
      }
    }
  };

  // 后台执行；不 await，请求可立即返回
  runner(emit, job.controller.signal)
    .then(() => {
      job.status = job.controller.signal.aborted ? 'aborted' : 'done';
    })
    .catch(err => {
      job.status = 'error';
      emit('error', { message: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      scheduleCleanup(job);
    });

  return job;
}

/**
 * 订阅任务事件。会先回放已缓冲的历史事件，再接收后续实时事件。
 * 返回取消订阅函数（客户端断开时调用，仅移除观察者，不影响任务）。
 */
export function subscribe(job: Job, subscriber: Subscriber): () => void {
  // 回放历史
  for (const ev of job.events) subscriber(ev);
  // 若任务已结束，无需继续订阅
  if (job.status !== 'running') {
    return () => {};
  }
  job.subscribers.add(subscriber);
  return () => {
    job.subscribers.delete(subscriber);
  };
}

/** 显式中断任务（用户点「中断生成」）。这是唯一会真正停止任务的入口。 */
export function abortJob(projectId: string, kind: Kind): boolean {
  const job = jobs.get(key(projectId, kind));
  if (job && job.status === 'running') {
    job.controller.abort();
    return true;
  }
  return false;
}

function scheduleCleanup(job: Job) {
  job.subscribers.clear();
  job.cleanupTimer = setTimeout(() => {
    // 仅当没有新任务覆盖时才删除
    if (jobs.get(job.id) === job) jobs.delete(job.id);
  }, RETAIN_AFTER_DONE_MS);
}
