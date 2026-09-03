import React from 'react';
import { CalendarClock, Pause, Play, Plus, Trash2, History, Zap } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import {
  SCHEDULE_LABELS,
  nextRunAfter,
  type ScheduledTask,
  type TaskSchedule,
} from '../../../shared/agentConfig';
import {
  Section,
  Panel,
  Row,
  Switch,
  Button,
  TextInput,
  Select,
  EmptyState,
  Callout,
  ConfirmDialog,
} from './AgentUi';

function formatWhen(at?: number): string {
  if (!at) return 'Never';
  const date = new Date(at);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Today at ${time}` : `${date.toLocaleDateString()} at ${time}`;
}

const SCHEDULE_OPTIONS = Object.entries(SCHEDULE_LABELS).map(([id, label]) => ({ id, label }));

export const PanelTasks: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const update = useAgentConfig((s) => s.update);

  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [prompt, setPrompt] = React.useState('');
  const [schedule, setSchedule] = React.useState<TaskSchedule>('daily');
  const [error, setError] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [showHistory, setShowHistory] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState<string | null>(null);

  const reset = () => {
    setName('');
    setPrompt('');
    setSchedule('daily');
    setError('');
    setCreating(false);
  };

  const create = async () => {
    if (!name.trim()) return setError('Give the task a name.');
    if (!prompt.trim()) return setError('Describe what the agent should do.');
    if (config.tasks.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) {
      return setError('You already have a task with that name.');
    }

    const task: ScheduledTask = {
      id: `task-${Date.now()}`,
      name: name.trim(),
      description: prompt.trim().slice(0, 120),
      prompt: prompt.trim(),
      schedule,
      status: 'active',
      nextRun: nextRunAfter(schedule, Date.now()),
      history: [],
    };
    await update({ tasks: [...config.tasks, task] });
    reset();
  };

  const patchTask = (id: string, patch: Partial<ScheduledTask>) =>
    update({ tasks: config.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const runNow = async (id: string) => {
    setRunning(id);
    try {
      await window.browserAPI.agent.tasks.runNow(id);
      await useAgentConfig.getState().load();
    } finally {
      setRunning(null);
    }
  };

  return (
    <>
      <Section
        title="Scheduled tasks"
        description="Jobs the agent runs on its own — checking a page, summarising something, keeping an eye on a change."
        action={
          !creating ? (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              New task
            </Button>
          ) : undefined
        }
      >
        {creating && (
          <Panel className="mb-3">
            <div className="flex flex-col gap-3 p-4">
              <TextInput
                label="Task name"
                value={name}
                onChange={(v) => {
                  setName(v);
                  setError('');
                }}
                placeholder="Check GitHub notifications"
              />
              <TextInput
                label="What should the agent do?"
                value={prompt}
                onChange={(v) => {
                  setPrompt(v);
                  setError('');
                }}
                placeholder="Open github.com/notifications and summarise anything new"
                error={error}
              />
              <div className="flex items-center justify-between gap-3">
                <Select
                  label="How often"
                  className="w-52"
                  value={schedule}
                  onChange={(v) => setSchedule(v as TaskSchedule)}
                  options={SCHEDULE_OPTIONS}
                />
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={reset}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={create}>
                    Create task
                  </Button>
                </div>
              </div>
            </div>
          </Panel>
        )}

        {config.tasks.length === 0 && !creating ? (
          <Panel>
            <EmptyState
              icon={CalendarClock}
              title="No scheduled tasks"
              description="Set up a task and the agent will run it on a schedule — for example, summarising your notifications each morning."
              action={
                <Button icon={Plus} onClick={() => setCreating(true)}>
                  Create your first task
                </Button>
              }
            />
          </Panel>
        ) : (
          <div className="grid gap-2.5">
            {config.tasks.map((task) => (
              <div key={task.id} className="rounded-md bg-[var(--surface)] p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-[var(--text)]">
                        {task.name}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] ${
                          task.status === 'active'
                            ? 'bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)]'
                            : 'bg-[var(--surface-2)] text-[var(--text-faint)]'
                        }`}
                      >
                        {task.status === 'active' ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                      {task.description}
                    </p>

                    <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[11.5px] text-[var(--text-faint)]">
                      <div className="flex gap-1.5">
                        <dt>Runs</dt>
                        <dd className="text-[var(--text-muted)]">{SCHEDULE_LABELS[task.schedule]}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Last</dt>
                        <dd className="text-[var(--text-muted)]">{formatWhen(task.lastRun)}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Next</dt>
                        <dd className="text-[var(--text-muted)]">
                          {task.status === 'active' ? formatWhen(task.nextRun) : 'Paused'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Zap}
                      disabled={running === task.id}
                      onClick={() => void runNow(task.id)}
                      title="Run this task now"
                    >
                      {running === task.id ? 'Running…' : 'Run'}
                    </Button>
                    <button
                      onClick={() =>
                        patchTask(task.id, {
                          status: task.status === 'active' ? 'paused' : 'active',
                          nextRun:
                            task.status === 'paused'
                              ? nextRunAfter(task.schedule, Date.now())
                              : task.nextRun,
                        })
                      }
                      aria-label={task.status === 'active' ? 'Pause task' : 'Resume task'}
                      className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                    >
                      {task.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    {task.history.length > 0 && (
                      <button
                        onClick={() => setShowHistory(showHistory === task.id ? null : task.id)}
                        aria-label="Task history"
                        aria-expanded={showHistory === task.id}
                        className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                      >
                        <History size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setPendingDelete(task.id)}
                      aria-label="Delete task"
                      className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--danger)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {showHistory === task.id && (
                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <ul className="grid gap-1.5">
                      {task.history.map((run, index) => (
                        <li key={index} className="flex items-start gap-2 text-[12px]">
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                              run.ok ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
                            }`}
                          />
                          <span className="text-[var(--text-faint)]">{formatWhen(run.at)}</span>
                          <span className="min-w-0 flex-1 text-[var(--text-muted)]">
                            {run.summary}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Background running">
        <Panel>
          <Row
            label="Let tasks run when the browser is closed"
            description="Keeps a small background process alive after you quit so scheduled tasks still happen. Uses a little battery."
          >
            <Switch
              label="Let tasks run when the browser is closed"
              checked={config.runWhenClosed}
              onChange={(v) => update({ runWhenClosed: v })}
            />
          </Row>
        </Panel>
      </Section>

      <Callout>
        A scheduled task runs with exactly the same permissions as when you ask the agent yourself.
        If it needs approval for something, it will wait for you rather than proceed.
      </Callout>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this task?"
        body="The task and its history will be removed. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (pendingDelete) {
            void update({ tasks: config.tasks.filter((t) => t.id !== pendingDelete) });
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
};
