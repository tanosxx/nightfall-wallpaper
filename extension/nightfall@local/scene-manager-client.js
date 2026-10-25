import Gio from 'gi://Gio';

// Downloads and archive validation run outside the preferences process. Shell
// never loads network code or executes JavaScript supplied by scene packages.
export class SceneManagerClient {
    constructor(extensionPath) {
        this._script = `${extensionPath}/scene-manager.py`;
        this._running = new Set();
    }

    run(command, ...args) {
        if (!['list', 'refresh', 'install', 'install-file', 'remove', 'preview', 'import-bundled'].includes(command))
            throw new Error('Неизвестная команда каталога.');
        const process = Gio.Subprocess.new(
            ['python3', this._script, command, ...args],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        let cancelled = false;
        const operation = {
            cancel() {
                cancelled = true;
                // communicate_utf8_async still reaps the child and completes
                // below, so cancelling cannot strand the UI in a busy state.
                process.force_exit();
            },
        };
        this._running.add(operation);
        operation.promise = new Promise((resolve, reject) => {
            process.communicate_utf8_async(null, null, (child, result) => {
                this._running.delete(operation);
                try {
                    const [, stdout, stderr] = child.communicate_utf8_finish(result);
                    if (cancelled) {
                        const error = new Error('Операция отменена.');
                        error.cancelled = true;
                        throw error;
                    }
                    let data;
                    try {
                        data = JSON.parse(stdout);
                    } catch {
                        throw new Error(child.get_successful()
                            ? 'Менеджер сцен вернул некорректный ответ.'
                            : (stderr.trim().slice(0, 400) || 'Не удалось запустить менеджер сцен.'));
                    }
                    if (!child.get_successful() || data.ok === false)
                        throw new Error(data.error || 'Не удалось выполнить операцию со сценой.');
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            });
        });
        return operation;
    }

    cancelAll() {
        for (const operation of this._running)
            operation.cancel();
    }
}
