// Discover every compiled API test on Windows and Unix; a new file must not be silently omitted.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
function discover(directory) {
    return fs.readdirSync(path.join(root, directory), {withFileTypes:true}).flatMap(entry => {
        const relative = directory + '/' + entry.name;
        return entry.isDirectory() ? discover(relative) : /\.test\.(?:js|cjs|mjs)$/.test(entry.name) ? [relative] : [];
    });
}
const files = discover('dist/test').sort();
if (!files.length) throw Error('No compiled API tests found');
if (process.argv.includes('--list')) console.log(JSON.stringify(files,null,2));
else {
    const result = spawnSync(process.execPath, ['--test', ...files], {cwd:root,stdio:'inherit'});
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
}
