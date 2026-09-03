/**
 * agentScheduler.ts — runs scheduled agent tasks.
 *
 * A single low-frequency timer scans for due tasks rather than one timer per
 * task: timers do not survive sleep/wake reliably, and a machine that was
 * suspended overnight should run its 7am task when it wakes rather than
 * silently skipping it.
 */

import { getAgentConfig, updateAgentConfig, logActivity } from './agentConfigStore';
import { notifyAgent } from './agentNotify';
import { nextRunAfter, type ScheduledTask } from '../shared/agentConfig';

const TICK_MS = 60_000;
const MAX_TASK_HISTORY = 20;

let timer: NodeJS.Timeout | null = null;
let runTask: ((task: ScheduledTask) => Promise<{ ok: boolean; summary: string }>) | null = null;
let running = false;

/** Supply the function that actually executes a task's prompt. */
export function setTaskRunner(
  runner: (task: ScheduledTask) => Promise<{ ok: boolean; summary: string }>
): void {
  runTask = runner;
}

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  // A task that came due while the app was closed should run shortly after
  // launch, not at the next whole minute.
  setTimeout(() => void tick(), 10_000);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(): Promise<void> {
  // Never overlap runs: a slow task must not stack up behind itself.
  if (running || !runTask) return;

  const config = getAgentConfig();
  if (config.autonomy === 'stopped') return;

  const now = Date.now();
  const due = config.tasks.find((task) => task.status === 'active' && task.nextRun <= now);
  if (!due) return;

  running = true;
  try {
    const result = await runTask(due);
    recordRun(due.id, result.ok, result.summary);
  } catch (error) {
    recordRun(due.id, false, error instanceof Error ? error.message : 'Task failed');
  } finally {
    running = false;
  }
}

function recordRun(taskId: string, ok: boolean, summary: string): void {
  const config = getAgentConfig();
  const now = Date.now();

  updateAgentConfig({
    tasks: config.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            lastRun: now,
            nextRun: nextRunAfter(task.schedule, now),
            history: [{ at: now, ok, summary }, ...task.history].slice(0, MAX_TASK_HISTORY),
          }
        : task
    ),
  });

  const task = config.tasks.find((t) => t.id === taskId);
  notifyAgent(
    ok ? 'scheduled_completed' : 'task_failed',
    ok ? 'Scheduled task finished' : 'Scheduled task failed',
    `${task?.name ?? 'Task'}: ${summary}`
  );
  logActivity({
    domain: 'scheduled task',
    action: `Ran "${task?.name ?? 'task'}"`,
    result: ok ? 'ok' : 'failed',
    permission: 'allow',
    detail: summary,
  });
}

/** Run a task immediately, outside its schedule. */
export async function runTaskNow(taskId: string): Promise<{ ok: boolean; summary: string }> {
  if (!runTask) return { ok: false, summary: 'The agent is not ready.' };
  if (running) return { ok: false, summary: 'Another task is already running.' };

  const task = getAgentConfig().tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, summary: 'That task no longer exists.' };

  running = true;
  try {
    const result = await runTask(task);
    recordRun(taskId, result.ok, result.summary);
    return result;
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'Task failed';
    recordRun(taskId, false, summary);
    return { ok: false, summary };
  } finally {
    running = false;
  }
}

export function isTaskRunning(): boolean {
  return running;
}
