export type StartupTask = () => Promise<void> | void;

export type StartupBootstrapOptions = {
  openWindow: () => void;
  tasks: StartupTask[];
  onError?: (error: unknown, taskIndex: number) => void;
};

export async function scheduleStartupBootstrap({
  openWindow,
  tasks,
  onError,
}: StartupBootstrapOptions): Promise<void> {
  openWindow();

  for (let index = 0; index < tasks.length; index += 1) {
    try {
      await tasks[index]();
    } catch (error) {
      onError?.(error, index);
    }
  }
}
