// Merged maps must never silently overwrite another effect's texture.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GROUND_ASSET_FILES} from '../extension/nightfall@local/titans-ground.js';
import {SKY_ASSET_FILES} from '../extension/nightfall@local/titans-sky.js';
import {LEFT_SMOKE_ASSET_FILES} from '../extension/nightfall@local/titans-left-smoke.js';
import {SUIT_ASSET_FILES} from '../extension/nightfall@local/titans-suit.js';

const owners = new Map();
let pixelCount = 0;
for (const [owner, files] of Object.entries({ground: GROUND_ASSET_FILES, sky: SKY_ASSET_FILES,
    leftSmoke: LEFT_SMOKE_ASSET_FILES, suit: SUIT_ASSET_FILES})) {
    if (owner !== 'suit') assert(Object.keys(files).length > 0, `${owner} has no assets`);
    for (const [key, filename] of Object.entries(files)) {
        assert(!owners.has(key), `${owner}.${key} overwrites ${owners.get(key)}`);
        owners.set(key, owner);
        assert(/^[a-z0-9-]+\.png$/.test(filename), `${owner} has invalid asset filename ${filename}`);
        const data = readFileSync(new URL(`../assets/titans/${filename}`, import.meta.url));
        assert.equal(data.subarray(1, 4).toString(), 'PNG', `${filename} must be PNG`);
        const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
        assert(width > 0 && height > 0 && width <= 16384 && height <= 16384, `${filename} has invalid dimensions`);
        pixelCount += width * height;
    }
}
console.log(JSON.stringify({uniqueAssetKeys: owners.size, originalAssetPixelCount: pixelCount,
    uncompressedBytesBeforeNativeCropCache: pixelCount * 4}));
