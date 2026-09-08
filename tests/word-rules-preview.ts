import {firstArena,type Arena} from '../src/arena';
import {emptyLanguageRule} from '../src/prompt-rules';
const params=new URLSearchParams(location.search),scenario=params.get('scenario')||'bank';
if(params.has('fresh')||!localStorage.getItem('badidea-run-v1')){
 const language=emptyLanguageRule();
 if(scenario==='no-e'||scenario==='early')language.bannedLetters=['e'];
 if(scenario==='no-the')language.bannedWords=['the'];
 if(scenario==='bank')language.wordBank={starterWords:['a','to','up','over','wall','go','i','can','make','and','wood'],pickups:['ladder','balloon','spring','fly','climb','boots']};
 const arena:Arena={...structuredClone(firstArena),round:scenario==='early'?3:4,title:scenario==='bank'?'Words worth finding':'Choose your words',rule:{title:scenario==='bank'?'Find your words':scenario==='no-the'?'No “the”':'No letter E',restriction:'',language}};
 localStorage.setItem('badidea-run-v1',JSON.stringify({arena,nextArena:{...structuredClone(firstArena),round:arena.round+1},spec:null,draft:null,roomHistory:[],collectedWords:[]}));
 localStorage.removeItem('badidea-inventory-v1');
 params.delete('fresh');history.replaceState(null,'',`${location.pathname}?${params}`);
}
await import('../src/main');
// Drive ordinary game inputs for repeatable browser pickup checks, without exposing game state.
const controls=document.createElement('aside');controls.style.cssText='position:fixed;right:12px;top:52px;z-index:50;display:flex;gap:4px';
for(const [key,label] of [['w','Walk forward'],['s','Walk back'],['a','Walk left'],['d','Walk right']]){
 const button=document.createElement('button');button.textContent=label;button.style.cssText='padding:5px;font-size:11px';
 button.onclick=()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key,code:`Key${key.toUpperCase()}`}));setTimeout(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key,code:`Key${key.toUpperCase()}`})),650);};controls.append(button);
}
document.body.append(controls);
