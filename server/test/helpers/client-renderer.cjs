const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function renderSummary(asset,summary){
 const elements=new Map();const element=()=>({children:[],classList:{add:()=>{}},appendChild(node){this.children.push(node)}});
 const document={getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
 const source=fs.readFileSync(path.resolve(__dirname,'../../..',asset.replace('app.js','renderer.js')),'utf8');
 const a=source.indexOf('export class Renderer {');if(a<0)throw Error('Renderer class boundary missing');
 const Renderer=vm.runInNewContext(source.slice(a).replace('export class','class')+'\nRenderer',{document,window:{},console});
 const renderer=Object.create(Renderer.prototype);renderer.app={t:key=>key};renderer.clearTimeoutForfeitUi=()=>{};renderer.renderGameOver('Synthetic',[],summary);
 return elements.get('game-over-details').children[0].children[1].textContent;
}
module.exports={renderSummary};
