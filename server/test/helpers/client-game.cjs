const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Load the complete actual class without running the DOM/network constructor.
function loadGame(relative='js/app.js',globals={}){
 const source=fs.readFileSync(path.resolve(__dirname,'../../..',relative),'utf8');
 const a=source.indexOf('class DominoGame {'),b=source.indexOf('\nlet game = null;',a);
 if(a<0||b<a)throw Error('client class boundaries missing');
 const Game=vm.runInNewContext(source.slice(a,b)+'\nDominoGame',{window:{},console,debugLog:()=>{},...globals},{filename:relative});
 return Object.create(Game.prototype);
}
module.exports={loadGame};
