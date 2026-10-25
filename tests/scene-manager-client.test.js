// gjs -m tests/scene-manager-client.test.js; no network or desktop is used.
import GLib from 'gi://GLib';
import {SceneManagerClient} from '../extension/nightfall@local/scene-manager-client.js';
function assert(value, message) { if (!value) throw new Error(message); }
const directory = GLib.dir_make_tmp('nightfall-client-test-XXXXXX');
GLib.file_set_contents(`${directory}/scene-manager.py`, `import json, sys, time
command = sys.argv[1]
if command == 'list': print(json.dumps({'scenes': [], 'argument': sys.argv[2]}))
elif command == 'refresh': print(json.dumps({'ok': False, 'error': 'Offline fixture'})); sys.exit(2)
elif command == 'preview': print('invalid JSON')
elif command == 'install': time.sleep(20)
`);
const client = new SceneManagerClient(directory);
const literal = 'scene; echo not-a-shell-command';
const result = await client.run('list', literal).promise;
assert(result.argument === literal, 'Arguments must be passed literally, without shell evaluation');
try {
    await client.run('refresh').promise;
    throw new Error('Expected backend error');
} catch (error) {
    assert(error.message === 'Offline fixture', 'Backend JSON errors must reach the UI');
}
try {
    await client.run('preview', 'test').promise;
    throw new Error('Expected malformed JSON error');
} catch (error) {
    assert(error.message.includes('некорректный'), 'Malformed responses need a useful error');
}
const operation = client.run('install', 'test');
operation.cancel();
try {
    await operation.promise;
    throw new Error('Expected cancellation');
} catch (error) {
    assert(error.cancelled === true, 'Cancellation must settle and be distinguishable from a failure');
}
assert(client._running.size === 0, 'Finished child operations must be reaped');
GLib.unlink(`${directory}/scene-manager.py`);
GLib.rmdir(directory);
print('PASS scene-manager client: literal arguments, backend errors, invalid JSON, cancellation');
