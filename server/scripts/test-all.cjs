// Enumerate test files in Node so discovery also works on Windows shells.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function discover(directory){
  return fs.readdirSync(path.join(root,directory),{withFileTypes:true}).flatMap(entry=>{
    const relative=directory+'/'+entry.name;
    if(entry.isDirectory())return discover(relative);
    return entry.isFile()&&/\.test\.(?:js|cjs|mjs)$/.test(entry.name)?[relative]:[];
  });
}
const files=discover('test').sort();
if(!files.length)throw new Error('No server test files found');
const options=process.argv.slice(2);
if(options.includes('--list')){
  console.log(JSON.stringify(files,null,2));
}else{
  const result=spawnSync(process.execPath,['--test',...options,...files],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
}
