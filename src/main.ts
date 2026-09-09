import {CodeRuntime} from './code-runtime';
import {firstArena,arenaSchema,ruleText,normalizeArenaRules,type Arena} from './arena';
import {getLanguageRule,languageInventoryVerdict,promptRuleViolation,collectedWordsForRule} from './prompt-rules';
import {WordPickups} from './word-pickups';
import {applyInventoryReset} from './inventory-reset';
import {WordWorkshop} from './word-workshop';
import {VoiceWorkshop} from './voice-workshop';
import {readRoomHistory,recordRoomTransition,type RoomMemory} from './room-rhythm';
import {levels,type LevelId} from './levels';
import {starters,shouldAutoDeploy} from './starters';
import './style.css';
import './menus.css';
import {resultMarkup,renderRoundResult,resultPrimaryAction,type RoundResultInput} from './round-result';
import {GameAudio} from './audio';
const sound=new GameAudio();
import { GameView } from './view';
import { Simulation,initPhysics } from './simulation';
import { prepareInvention,type Invention } from './spec';
import {InventionPreview} from './preview';
import {readBuildResponse,type InventionOutline} from './build-stream';
const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
document.querySelector('#app')!.innerHTML=`
<div id="stage" aria-label="First-person 3D prison escape game"></div><div class="vignette"></div>
<div id="hud" class="hidden"><div class="hud-top"><div class="mission"><span class="micro" id="chapter-label">01 / 03 · THE COURTYARD</span><b id="objective">ESCAPE THE COURTYARD</b><span id="active-rule" class="hidden"></span><span id="subobjective">The guard has the key. You have an imagination.</span></div><div class="room-status"><div class="connection"><i></i><span>Connecting</span></div><span id="director-status"></span></div></div><div id="danger" class="hidden"><span>GUARD IS GRABBING YOU · MOVE AWAY</span><div><i></i></div></div><div id="look-help"></div><div id="interaction"></div><div class="reticle"><i></i><i></i></div><div id="bubble" role="status"></div><div class="hud-bottom"><div class="health"><span>042</span><div><b>STILL BREATHING</b><small id="attempt">ATTEMPT 01</small></div></div><div class="equipment"><span class="micro" id="equipment-label">EMPTY HANDS. BIG IDEAS.</span><b id="equipped-name">Invent something.</b><span id="phase-label">Press E to open your imagination</span></div><div class="keybinds"><span><kbd>E</kbd> Invent</span><span><kbd>V</kbd> Speak idea</span><span><kbd>F</kbd> Use</span><button id="open-inventory"><kbd>I</kbd> Inventory</button><span><kbd>H</kbd> Help</span><span><kbd>R</kbd> Retry</span></div></div></div>
<div id="menu" class="overlay intro" aria-labelledby="menu-title"><div class="menu-shell"><div class="menu-title"><span class="micro">AN ADAPTIVE ESCAPE ROOM</span><h1 id="menu-title">Bad idea<span class="title-dot">.</span></h1><p>Invent a way out.<br>The room learns. You improvise.</p></div><div class="menu-actions"><button id="enter" class="primary-action" disabled>New run <span aria-hidden="true">↗</span></button><button id="continue-run" class="secondary-action hidden">Continue saved run</button></div><p class="menu-controls"><span><kbd>WASD</kbd> Move</span><span><kbd>E</kbd> Invent</span><span><kbd>Esc</kbd> Pause</span></p><details class="classic-rooms"><summary>Classic rooms</summary><div class="menu-bottom" id="chapters"></div></details></div></div>
<div id="workshop" class="overlay hidden"><div class="workshop"><div class="workshop-top"><span class="micro">INVENT</span><button id="close-workshop">Close <kbd>Esc</kbd></button></div><div class="workshop-grid"><div class="idea-side"><span class="micro">YOUR NEXT IDEA</span><h2>Make something.</h2><p id="room-rule" class="hidden"></p><form id="form"><label for="prompt">What should it do?</label><textarea id="prompt" maxlength="1200" rows="3" placeholder="A balloon that carries me over the wall…"></textarea><button id="invent" type="submit">Build <span>↗</span></button></form><div id="generation" class="hidden" role="status"><div class="spinner"></div><div><b>Astra is building</b><span id="timer"></span></div><button id="cancel">CANCEL</button></div><p id="error" role="alert" class="hidden"></p><button id="starter" type="button">Try a simple ladder</button><button id="new-idea" type="button">New idea</button><div class="suggestions"><span class="micro">TRY AN IDEA</span><button data-prompt="A tiny mechanical bird that steals the guard's key and brings it to me">KEYBIRD</button><button data-prompt="A compact ice pistol that freezes the guard when I aim and fire">ICE RAY</button><button data-prompt="A tall wooden ladder I can climb over the prison wall">LADDER</button><button data-prompt="An invisibility cloak so I can sneak close and pickpocket the guard">CLOAK</button><button data-prompt="A trampoline that launches me over the prison wall when I jump onto it">TRAMPOLINE</button><button data-prompt="Rocket-powered skates with a parachute that opens when I start falling">ROCKET SKATES</button></div></div><div class="invention-side"><div id="preview" aria-label="3D invention preview"></div><div id="empty-invention"><div class="empty-model">+</div><h3>What if?</h3><p>Describe an object and what it does.<br>Then put it to use.</p></div><div id="invention-card" class="hidden"><span class="micro">YOUR INVENTION</span><h3 id="invention-name"></h3><p id="invention-description"></p><p id="invention-usage"></p><p id="invention-limitations"></p><div id="parts-info"></div><span id="speed"></span><button id="equip">Equip <span>↗</span></button><button id="discard">Discard</button></div></div></div></div></div>
<div id="pause" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="pause-box menu-panel"><div class="menu-heading"><span class="micro">PAUSED</span><h2 id="pause-title">Take a breather.</h2></div><div class="pause-actions"><button id="resume" class="primary-action">Back to the room <kbd>Esc</kbd></button><div class="pause-tools"><button id="pause-invent">Invent <kbd>E</kbd></button><button id="restart">Retry round <kbd>R</kbd></button></div></div><details class="menu-settings"><summary>Settings & controls</summary><div class="settings"><label for="sensitivity">Look sensitivity <output id="sensitivity-value">1.0</output></label><input id="sensitivity" type="range" min="0.3" max="2" step="0.1" value="1"><label class="check"><input id="motion" type="checkbox"> Camera motion</label><label class="check"><input id="sound" type="checkbox" checked> Sound</label><dl class="control-guide"><div><dt>WASD</dt><dd>Move</dd></div><div><dt>Mouse</dt><dd>Look</dd></div><div><dt>Space</dt><dd>Jump</dd></div><div><dt>Shift</dt><dd>Sprint</dd></div><div><dt>V</dt><dd>Speak an invention · V again to finish</dd></div><div><dt>F</dt><dd>Use invention</dd></div><div><dt>I</dt><dd>Inventory</dd></div></dl></div></details><div class="pause-footer"><button id="level-menu">Main menu</button><button id="new-run">Start fresh</button></div><small class="reset-note">New runs start with an empty inventory.</small></div></div>
<div id="result" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="result-title" tabindex="-1">${resultMarkup}</div>
<section id="inventory" class="hidden"><header><span>Inventory</span><button id="close-inventory">Close <kbd>Esc</kbd></button></header><p class="inventory-help">↑ ↓ Choose · Enter Equip · Esc Back</p><p id="inventory-rule" class="hidden"></p><div id="inventory-list"></div><p id="inventory-reason"></p><p id="inventory-empty">Your inventions will appear here.</p></section><button id="build-notice" class="hidden" aria-live="polite"></button><div id="touch-controls" class="hidden"><button data-dir="up">↑</button><button data-dir="left">←</button><button data-dir="down">↓</button><button data-dir="right">→</button><button id="touch-invent">INVENT</button><button id="touch-use">USE</button></div>`;
let arena:Arena|null={...firstArena},nextArena:Arena|null=null,roomHistory:RoomMemory[]=[],nextFor='',directorBusy=false,directorError='',directorController:AbortController|null=null,directorVersion=0,roomFailure='',previousForRule:Invention|null=null;
let plannedBuild:{key:string,actualKey?:string}|null=null;
let runVersion=0,buildVersion=0;
let savedSession:ReturnType<typeof snapshotRun>|null=null;
let voiceReleasePending=false;let voiceEscapeUntil=0;let escapeHandledUntil=0;let inventorySelection=0;let inventoryOpen=false;let inventory:{key:string,item:Invention,prompt?:string}[]=[];
let collectedWords:string[]=[],wordPickups:WordPickups|null=null;
let lastInventoryResetRound:number|null=null;
let workbenchOpen=false;
let level:LevelId=0;let unlocked=0;try{unlocked=Math.max(0,Math.min(3,Number(localStorage.getItem('badidea-progress'))||0));}catch{}
let sim:Simulation,view:GameView,preview:InventionPreview,spec:Invention|null=null,draft:Invention|null=null,startingNew=false,busy=false,attempts=1,controller:AbortController|null=null,ready=false,mode:'intro'|'play'|'pause'|'result'='intro',hasStarted=false;
const keys=new Set<string>();let noticeUntil=0;let drag=false,dragX=0,dragY=0,dragDistance=0;let fallbackLook=false;let sensitivity=1;let mouseReady=false;let edgeTurn=0;let capturePending:Promise<void>|null=null;
let voiceWorkshop:VoiceWorkshop|undefined;
const wordWorkshop=new WordWorkshop(()=>({arena,collectedWords,busy:busy||!!voiceWorkshop?.active}));
voiceWorkshop=new VoiceWorkshop({open:craftVoice,available:()=>ready&&!busy&&(mode==='play'||mode==='pause')&&!inventoryOpen,refresh:()=>wordWorkshop.refresh()});
function authoredPrompt(item:Invention|null){return item?inventory.find(entry=>entry.key===inventionKey(item))?.prompt:undefined;}
function collectWord(word:string){
 if(collectedWords.includes(word))return;collectedWords=[...collectedWords,word];saveIdeas();wordWorkshop.refresh();drawInventory();sim.note(`Word unlocked: ${word}. Open Invent to use it.`);sound.tone(660,.12,.06,880);
}
function refreshRules(){
 const restriction=arena&&(arena.rule.restriction||getLanguageRule(arena))?ruleText(arena.rule):'';
 const text=[arena?.inventoryReset?'Fresh start: build a new inventory this round.':'',restriction].filter(Boolean).join(' ');
 for(const selector of ['#active-rule','#inventory-rule','#room-rule']){const node=$(selector);node.textContent=text;node.classList.toggle('hidden',!text);}
 wordWorkshop.refresh();
}
function inventionKey(item:Invention|null){if(!item)return 'empty';let h=0;for(const c of JSON.stringify(item))h=(Math.imul(h,31)+c.charCodeAt(0))|0;return String(h);}
function invalidateDirector(){plannedBuild=null;directorVersion++;directorController?.abort();directorController=null;directorBusy=false;directorError='';nextArena=null;nextFor='';$('#director-status').textContent='';}
function startCounter(){if(!arena||directorBusy||directorError)return;if(nextArena){$('#director-status').textContent='Next room · ready';return;}if(!spec&&arena.round===1)return;void prepareNext();}
function attachRoom(){if(!arena?.code)return;new CodeRuntime(sim,view,message=>queueMicrotask(()=>{invalidateDirector();roomFailure=message;sim.fail('Astra hit a runtime error. It is repairing this room.');void prepareNext(message);}),(...args)=>sound.tone(args[0],args[1],args[2],args[3]),arena.code,'room',true);}
function roundResultInput():RoundResultInput{
 return {won:sim.state==='won',round:arena?.round??null,roomName:arena?.title||levels[level].name,
  reason:sim.reason,roomFailure:!!roomFailure,nextRoom:nextArena?{round:nextArena.round,title:nextArena.title,change:nextArena.change,
   rule:[nextArena.inventoryReset&&nextArena.round>(arena?.round||0)?'Fresh start: your inventory will be cleared when you enter.':'',nextArena.rule.restriction||getLanguageRule(nextArena)?ruleText(nextArena.rule):'',nextArena.inventoryReset||nextArena.carryAllowed?'':nextArena.carryReason].filter(Boolean).join(' ')}:null,
  directorBusy,directorError,finalClassic:!arena&&level===2};
}
function showCounter(){renderRoundResult($('#result'),roundResultInput());}
async function prepareNext(repair?:string,planned?:{prompt:string,previous:Invention|null}){
 if(!arena||directorBusy)return;const version=++directorVersion,currentArena=arena,key=planned?plannedBuild!.key:inventionKey(spec);directorBusy=true;directorError='';directorController=new AbortController();
 $('#director-status').textContent=repair?'Repairing room':'Next room · building';if(mode==='result')showCounter();
 try{
  const r=await fetch('/api/direct',{method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({arena:currentArena,previous:planned?.previous||spec,plannedInvention:planned,repair,history:roomHistory,inventory:inventoryPayload(),collectedWords,telemetry:{won:sim.state==='won',elapsed:sim.elapsed,uses:sim.uses,maxHeight:sim.maxHeight,position:sim.position,removed:sim.entities.filter(e=>e.removed).map(e=>e.id),events:sim.events.slice(-8)}}),signal:directorController.signal});
  const data=await readBuildResponse(r,()=>{});if(version!==directorVersion)return;
  nextArena=normalizeArenaRules(arenaSchema.parse(data.arena));nextFor=plannedBuild?.key===key?(plannedBuild.actualKey||key):key;saveIdeas();$('#director-status').textContent=repair?'Room repaired':'Next room · ready';
 }catch(e){if((e as Error).name!=='AbortError'&&version===directorVersion){directorError=(e as Error).message;$('#director-status').textContent='Next room needs another try';}}
 finally{if(version===directorVersion){directorBusy=false;directorController=null;if(mode==='result')showCounter();}}
}
$('#retry-director').onclick=()=>void prepareNext(roomFailure||undefined);
function attachCode(){
 if(!spec?.code)return;
 new CodeRuntime(sim,view,message=>queueMicrotask(()=>{if(busy)return;craft();showCard();void buildInvention(authoredPrompt(spec)||'Repair this invention so its intended behavior works.',spec,message);}),(...args)=>sound.tone(args[0],args[1],args[2],args[3]),spec.code,'invention',true);
}
function snapshotRun(){return {arena,nextArena,roomHistory,nextFor,spec,draft,previousForRule,plannedBuild,level,collectedWords,lastInventoryResetRound,inventory};}
function updateContinue(){
 const saved=savedSession,available=!!saved&&(!!saved.spec||!!saved.draft||!!saved.nextArena||!saved.arena||saved.arena.round>1);
 $('#continue-run').classList.toggle('hidden',!available);
 if(available)$('#continue-run').textContent=saved.arena?`Continue round ${saved.arena.round} · C`:'Continue saved room · C';
}

function saveIdeas(){savedSession=snapshotRun();updateContinue();try{localStorage.setItem('badidea-inventions-v1',JSON.stringify({spec,draft,level}));localStorage.setItem('badidea-run-v1',JSON.stringify(snapshotRun()));localStorage.setItem('badidea-inventory-v1',JSON.stringify(inventory));}catch{/* Storage may be unavailable; gameplay still works. */}}
function say(text:string){const brief=text.length>95?text.slice(0,92).replace(/\s+\S*$/,'')+'…':text;$('#bubble').textContent=brief;noticeUntil=performance.now()+2200;}
function showMode(next:typeof mode){
 const changed=mode!==next;mode=next;mouseReady=false;edgeTurn=0;
 if(next!=='play'){workbenchOpen=false;inventoryOpen=false;}
 if(next!=='play'||!workbenchOpen)voiceWorkshop?.cancel();
 $('#stage').classList.toggle('looking',next==='play');$('#app').classList.toggle('game-active',next==='play');$('#app').dataset.mode=next;
 if(next==='play'&&!workbenchOpen&&!inventoryOpen){(document.activeElement as HTMLElement)?.blur?.();view?.renderer.domElement.focus({preventScroll:true});}
 keys.clear();drag=false;if(sim){sim.manual=null;sim.jumpBuffer=0;}
 $('#inventory').classList.toggle('hidden',next!=='play'||!inventoryOpen);$('#menu').classList.toggle('hidden',next!=='intro');
 $('#workshop').classList.toggle('hidden',next!=='play'||!workbenchOpen);$('#pause').classList.toggle('hidden',next!=='pause');$('#result').classList.toggle('hidden',next!=='result');
 $('#hud').classList.toggle('hidden',next!=='play');$('#touch-controls').classList.toggle('hidden',next!=='play'||matchMedia('(pointer:fine)').matches);
 if(next!=='play'&&document.pointerLockElement)document.exitPointerLock();
 if(changed&&next!=='play'){
  const focus=next==='pause'?$('#resume'):next==='intro'?$('#enter'):document.getElementById(resultPrimaryAction(roundResultInput())||'result');
  focus?.focus({preventScroll:true});
 }
}
function reset(){voiceWorkshop?.cancel();wordPickups?.dispose();wordPickups=null;view?.endConstruction();if(spec&&legality(spec)?.allowed===false){remember(spec);previousForRule=spec;spec=null;draft=null;}sim?.dispose();sim=new Simulation(level,arena);if(arena)view.setArena(arena);else view.setLevel(level);if(spec?.mount==='free'&&spec.phases.some(p=>p.actions.some(a=>a.op==='deliver'))){const prompt=authoredPrompt(spec);spec={...spec,spawn:[-5.3,1.8,0]};remember(spec,prompt);}sim.start(spec);view.clearParticles();view.setInvention(spec);attachRoom();sim.player.setTranslation({x:-6,y:.85,z:0},true);sim.player.setLinvel({x:0,y:0,z:0},true);sim.player.resetForces(true);sim.previous={x:-6,y:.85,z:0};view.yaw=-Math.PI/2;view.pitch=level===1?-.12:level===2?.12:0;$('#objective').textContent=arena?.objective||levels[level].objective;$('#subobjective').textContent=arena?.hint||levels[level].hint;$('#chapter-label').textContent=arena?`ROUND ${String(arena.round).padStart(2,'0')} · ${arena.title}`:`0${level+1} / 03 · ${levels[level].name}`;$('#active-rule').textContent=arena?.rule.restriction?ruleText(arena.rule):'';$('#active-rule').classList.toggle('hidden',!arena?.rule.restriction);$('#inventory-rule').textContent=arena?.rule.restriction?ruleText(arena.rule):'';$('#inventory-rule').classList.toggle('hidden',!arena?.rule.restriction);$('#room-rule').textContent=arena?ruleText(arena.rule):'';$('#room-rule').classList.toggle('hidden',!arena?.rule.restriction);$('#starter').classList.toggle('hidden',!!arena&&arena.round>1);$('#starter').textContent=arena?'Try a simple ladder':`Try ${starters[level].name}`;$('#attempt').textContent=`ATTEMPT ${String(attempts++).padStart(2,'0')}`;$('#equipped-name').textContent=spec?.name||'Invent something.';$('#equipment-label').textContent=spec?'INVENTION EQUIPPED':'EMPTY HANDS. BIG IDEAS.';$('#phase-label').textContent=spec?spec.usage:'E to invent';noticeUntil=0;
const ideas=arena?['A big balloon that carries me over the wall','A wooden ladder I can climb','A grappling hook that pulls me where I aim','A portable catapult that launches me','A drill that cuts through the wall','Spring boots for giant jumps']:level===0?['A tiny mechanical bird that steals the guard’s key','A compact ice pistol to freeze the guard','A tall wooden ladder over the wall','An invisibility cloak','A trampoline to jump over the wall','Rocket skates with a parachute']:level===1?['A pocket teleport device to cross the gap','A solid wooden bridge across the gap','Rocket skates with a parachute','A trampoline to launch across the gap','A grappling hook pulling me across the gap','A small jetpack for crossing the gap']:['A ladder to reach the rooftop','A trampoline to launch onto the roof','Rocket boots with a parachute','A grappling hook to the rooftop','A jetpack with controlled landing','A teleport device to reach the rooftop'];
for(const [i,b] of [...document.querySelectorAll<HTMLButtonElement>('[data-prompt]')].entries()){b.dataset.prompt=ideas[i];b.textContent=ideas[i];}
 const language=getLanguageRule(arena),bank=language?.wordBank;collectedWords=collectedWordsForRule(language,collectedWords);
 if(bank){wordPickups=new WordPickups(sim,view.scene,bank.pickups,collectedWords,collectWord);
  if(wordPickups.unplaced.length){invalidateDirector();roomFailure='Word pickups could not be placed on safe reachable floor near spawn. Restore clear supported walking space in the entrance so every word can be collected on foot.';sim.fail('Astra is restoring a safe place to collect words.');void prepareNext(roomFailure);}
 }
 refreshRules();startCounter();}
function captureMouse(){
 if(document.pointerLockElement===view.renderer.domElement){fallbackLook=false;return Promise.resolve();}
 if(capturePending)return capturePending;
 fallbackLook=true;edgeTurn=0;
 capturePending=(async()=>{
  try{await view.renderer.domElement.requestPointerLock();fallbackLook=document.pointerLockElement!==view.renderer.domElement;}
  catch{fallbackLook=true;}
  finally{capturePending=null;if(mode!=='play'){fallbackLook=true;if(document.pointerLockElement)document.exitPointerLock();}}
 })();
 return capturePending;
}
async function play(){if(!ready)return;workbenchOpen=false;inventoryOpen=false;sound.unlock();if(!hasStarted){reset();hasStarted=true;}showMode('play');await captureMouse();}

function equipSample(){if(busy)return;if(arena&&arena.round>1){craft();return;}draft=sample();$('#equip').click();}
function sample(){return arena?prepareInvention({...starters[2],name:'Wooden ladder',spawn:[3.65,0,0]}):prepareInvention(starters[level]);}
function craft(){if(!ready)return;inventoryOpen=false;if(!hasStarted){reset();hasStarted=true;}edgeTurn=0;workbenchOpen=true;showMode('play');showCard();refreshRules();$<HTMLTextAreaElement>('#prompt').focus();}
function craftVoice(){craft();if(document.pointerLockElement){voiceReleasePending=true;fallbackLook=true;document.exitPointerLock();}}
$('#enter').onclick=startFreshRun;$('#continue-run').onclick=continueSavedRun;$('#resume').onclick=play;$('#close-workshop').onclick=play;$('#equip').onclick=()=>equipDraft(true);$('#pause-invent').onclick=craft;
$('#restart').onclick=()=>{reset();play();};$('#retry').onclick=()=>{reset();play();};
function inventoryPayload(){return inventory.map(({key,item,prompt})=>({key,prompt,name:item.name,description:item.description,usage:item.usage,limitations:item.limitations,code:item.code}));}
function legality(item:Invention){
 const key=inventionKey(item),language=languageInventoryVerdict(authoredPrompt(item),getLanguageRule(arena),collectedWords);
 if(language&&!language.allowed)return {key,...language};
 if(!arena?.rule.restriction)return null;
 return arena.inventoryVerdicts?.find(v=>v.key===key)||{key,allowed:false,reason:'Checking this round’s rule…'};
}
let ruleCheck:Promise<void>|null=null;
async function checkInventoryRules(){
 if(!arena?.rule.restriction)return;if(ruleCheck){await ruleCheck;if(!arena?.rule.restriction)return;}
 const current=arena,known=new Set(current.inventoryVerdicts?.map(v=>v.key)||[]),missing=inventoryPayload().filter(v=>!known.has(v.key));if(!missing.length)return;
 ruleCheck=(async()=>{try{const response=await fetch('/api/check-rule',{method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({arena:current,inventory:missing,collectedWords})});const data=await readBuildResponse(response,()=>{});if(arena!==current)return;current.inventoryVerdicts=[...(current.inventoryVerdicts||[]),...(data.semanticVerdicts||data.verdicts)];saveIdeas();drawInventory();}catch{say('Rule check needs another try. Reopen inventory.');}finally{ruleCheck=null;}})();await ruleCheck;
}
function remember(item:Invention,prompt?:string){
 const key=inventionKey(item),entry=inventory.find(entry=>entry.key===key);if(!entry)inventory.unshift({key,item,prompt});else if(prompt!==undefined)entry.prompt=prompt;
 try{localStorage.setItem('badidea-inventory-v1',JSON.stringify(inventory));}catch{}
}
function equipDraft(resume:boolean){
 if(draft){
  if(spec)remember(spec);
  const verdict=legality(draft);if(verdict&&!verdict.allowed){say(verdict.reason);return;}
  spec=draft;draft=null;previousForRule=null;remember(spec);sim.equip(spec);view.setInvention(spec);attachCode();if(shouldAutoDeploy(spec))sim.activate();
  $('#equipped-name').textContent=spec.name;$('#equipment-label').textContent='INVENTION EQUIPPED';$('#phase-label').textContent=spec.usage;startCounter();
 }
 startingNew=false;$('#build-notice').classList.add('hidden');saveIdeas();drawInventory();if(resume)void play();
}
function chooseInventory(index:number){
 const entry=inventory[index];if(!entry)return;draft=entry.item;
 if(languageInventoryVerdict(entry.prompt,getLanguageRule(arena),collectedWords)?.allowed===false){
  startingNew=false;previousForRule=entry.item;$<HTMLTextAreaElement>('#prompt').value=entry.prompt||'';craft();return;
 }
 equipDraft(true);
}
function drawInventory(){
 const selected=inventory[inventorySelection];$('#inventory-reason').textContent=selected?(legality(selected.item)?.reason||''):'';const list=$('#inventory-list');list.replaceChildren();$('#inventory-empty').classList.toggle('hidden',inventory.length>0);
 for(const [index,entry] of inventory.entries()){const button=document.createElement('button');button.className='inventory-item';const name=document.createElement('span');name.textContent=(index<9?(index+1)+'. ':'')+entry.item.name;const state=document.createElement('small');const verdict=legality(entry.item);const needsDescription=languageInventoryVerdict(entry.prompt,getLanguageRule(arena),collectedWords)?.allowed===false;state.textContent=verdict&&!verdict.allowed?(needsDescription?'Describe again ↗':verdict.reason==='Checking this round’s rule…'?'Checking…':'Not allowed'):inventionKey(spec)===entry.key?'Equipped':'Equip ↗';button.title=verdict?.reason||'';button.disabled=!!verdict&&!verdict.allowed&&!needsDescription;button.append(name,state);button.classList.toggle('selected',inventionKey(spec)===entry.key);button.classList.toggle('highlighted',inventorySelection===index);button.setAttribute('aria-selected',String(inventorySelection===index));button.onclick=()=>chooseInventory(index);list.append(button);}
}
function openInventory(){if(!ready)return;if(!hasStarted){reset();hasStarted=true;}if(spec)remember(spec);edgeTurn=0;workbenchOpen=false;inventoryOpen=true;inventorySelection=Math.max(0,inventory.findIndex(entry=>entry.key===inventionKey(spec)));showMode('play');drawInventory();void checkInventoryRules();}
$('#open-inventory').onclick=openInventory;$('#close-inventory').onclick=play;
function drawChapters(){
 $('#chapters').innerHTML=levels.map((l,i)=>`<button data-level="${i}" >0${i+1} · ${l.name}${i<unlocked?' ✓':''}</button>`).join('');
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-level]'))b.onclick=()=>{runVersion++;cancelBuild();invalidateDirector();arena=null;collectedWords=[];roomFailure='';level=Number(b.dataset.level) as LevelId;spec=null;draft=null;saveIdeas();reset();hasStarted=true;play();};
}
drawChapters();
$('#level-menu').onclick=$('#result-menu').onclick=()=>showMode('intro');
function cancelBuild(){
 buildVersion++;controller?.abort();controller=null;busy=false;view?.endConstruction();
 $('#generation').classList.add('hidden');$('#build-notice').classList.add('hidden');
 for(const selector of ['#invent','#equip','#starter'])$(selector).removeAttribute('disabled');
 $('#error').classList.add('hidden');wordWorkshop.refresh();
}
function startFreshRun(){
 if(!ready)return;runVersion++;cancelBuild();invalidateDirector();arena=structuredClone(firstArena);roomHistory=[];roomFailure='';level=0;spec=null;draft=null;previousForRule=null;startingNew=false;
 inventory=[];inventorySelection=0;collectedWords=[];lastInventoryResetRound=null;
 try{localStorage.removeItem('badidea-inventory-v1');}catch{/* Storage may be unavailable. */}
 drawInventory();
 $<HTMLTextAreaElement>('#prompt').value='';saveIdeas();reset();hasStarted=true;void play();
}
function continueSavedRun(){
 if(!ready||!savedSession)return;const saved=savedSession;runVersion++;cancelBuild();invalidateDirector();
 ({arena,nextArena,roomHistory,nextFor,spec,draft,previousForRule,plannedBuild,level,collectedWords,lastInventoryResetRound,inventory}=saved);roomFailure='';startingNew=false;clearInventoryOnEntry();reset();hasStarted=true;void play();
}
$('#new-run').onclick=startFreshRun;
function clearInventoryOnEntry(){
 const current={inventory,spec,draft,previousForRule,lastInventoryResetRound};
 const next=applyInventoryReset(current,arena);if(next===current)return false;
 // Aborted or already completed requests from the old inventory must not restore it.
 runVersion++;cancelBuild();voiceWorkshop?.cancel();
 ({inventory,spec,draft,previousForRule,lastInventoryResetRound}=next);
 inventorySelection=0;startingNew=false;$<HTMLTextAreaElement>('#prompt').value='';
 if(arena)arena.inventoryVerdicts=[];
 preview?.set(null);drawInventory();saveIdeas();return true;
}
$('#next-level').onclick=()=>{if(arena){if(!nextArena)return;const old=arena;arena=normalizeArenaRules(nextArena);if(arena.round!==old.round)collectedWords=[];nextArena=null;$('#director-status').textContent='';roomHistory=recordRoomTransition(roomHistory,old,arena.round);roomFailure='';nextFor='';plannedBuild=null;const cleared=clearInventoryOnEntry();if(spec&&legality(spec)?.allowed===false){remember(spec);previousForRule=spec;spec=null;draft=null;}saveIdeas();reset();if(cleared)sim.note('Fresh start. Your old inventions are gone—make a new idea.');void checkInventoryRules();play();return;}level=Math.min(2,level+1) as LevelId;spec=null;draft=null;saveIdeas();reset();play();};
$('#starter').onclick=()=>{if(busy)return;draft=sample();startingNew=false;saveIdeas();showCard();$('#speed').textContent='Ready now';};
function showCard(){
 const item=draft||(!startingNew?spec:null);preview?.set(item);
 $('#invention-card').classList.toggle('hidden',!draft);$('#empty-invention').classList.toggle('hidden',!!item);$('#preview').classList.toggle('hidden',!item);
 $('#invent').innerHTML=item?'Modify <span>↗</span>':'Build <span>↗</span>';wordWorkshop.refresh();
 if(!item)return;
 $('#invention-name').textContent=item.name;$('#invention-description').textContent=item.description;$('#invention-usage').textContent=item.usage;
 $('#invention-limitations').textContent=item.limitations.join(' ');$('#invention-limitations').classList.toggle('hidden',item.limitations.length===0);
 $('#parts-info').textContent=draft?(spec?'Replaces '+spec.name+' when equipped':'Ready to equip'):'Currently equipped';
 $('#discard').textContent=draft?'Discard draft':'Unequip';$('#equip').innerHTML=draft?'Equip <span>↗</span>':'Return to room <span>↗</span>';
}
$('#discard').onclick=()=>{if(busy)return;if(draft){draft=null;}else{spec=null;sim.equip(null);view.setInvention(null);$('#equipped-name').textContent='Invent something.';$('#equipment-label').textContent='EMPTY HANDS. BIG IDEAS.';}startingNew=false;saveIdeas();showCard();};
$('#new-idea').onclick=()=>{if(busy)return;startingNew=true;draft=null;$<HTMLTextAreaElement>('#prompt').value='';$<HTMLTextAreaElement>('#prompt').placeholder='A ladder, an ice ray, an invisible cloak…';showCard();wordWorkshop.refresh();$<HTMLTextAreaElement>('#prompt').focus();};
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-prompt]'))button.onclick=()=>{if(busy)return;startingNew=true;draft=null;showCard();$<HTMLTextAreaElement>('#prompt').value=button.dataset.prompt!;wordWorkshop.refresh();$<HTMLTextAreaElement>('#prompt').focus();};
async function buildInvention(prompt:string,previous:Invention|null,repair?:string){
 if(busy||!ready)return;
 voiceWorkshop?.cancel();
 const violation=promptRuleViolation(prompt,getLanguageRule(arena),collectedWords);
 if(violation){$('#error').textContent=violation;$('#error').classList.remove('hidden');wordWorkshop.refresh();return;}
 if(arena&&!repair&&!directorBusy&&!nextArena){plannedBuild={key:'prompt:'+Date.now()+':'+prompt};void prepareNext(undefined,{prompt,previous});}
 const buildId=++buildVersion,buildRun=runVersion,buildArena=arena;
 const requestController=new AbortController();controller=requestController;busy=true;
 for(const selector of ['#invent','#equip','#starter'])$(selector).setAttribute('disabled','');
 $('#generation').classList.remove('hidden');$('#error').classList.add('hidden');
 const startTime=performance.now();let partCount=0;
 const updateStatus=()=>{
  const seconds=((performance.now()-startTime)/1000).toFixed(1);
  const stage=partCount?`${partCount} ${partCount===1?'part':'parts'} outlined`:'Sketching outline';
  $('#timer').textContent=`${seconds}s · ${stage}`;
  $('#build-notice').textContent=`${repair?'Repairing':'Building'} · ${stage} · ${seconds}s`;
 };
 const ticker=setInterval(updateStatus,100);
 workbenchOpen=false;showMode('play');$<HTMLTextAreaElement>('#prompt').blur();void captureMouse();
 view.beginConstruction(sim.position,sim.aim);updateStatus();$('#build-notice').classList.remove('hidden');
 try{
  const response=await fetch('/api/invent',{method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({prompt,previous,repair,level,arena,collectedWords,scene:{player:{position:[sim.position.x,sim.position.y,sim.position.z],mass:1,walkSpeed:3.2},guard:level===0&&!arena?{position:[sim.guard.x,0,sim.guard.z]}:null,keyOwner:arena?'none':level===0?sim.keyOwner:'none',gateOpen:sim.gateOpen}}),signal:requestController.signal});
  const data=await readBuildResponse(response,(outline:InventionOutline)=>{
   if(buildId!==buildVersion||runVersion!==buildRun)return;
   partCount=outline.parts.length;view.updateConstruction(outline);updateStatus();
  });
  if(buildId!==buildVersion||runVersion!==buildRun)return;
  const completedInvention=prepareInvention(data.invention);draft=completedInvention;remember(completedInvention,prompt);
  if(arena?.rule.restriction){
   if(arena===buildArena){arena.inventoryVerdicts=[...(arena.inventoryVerdicts||[]).filter(v=>v.key!==inventionKey(draft)),{key:inventionKey(draft),allowed:true,reason:''}];}
   else await checkInventoryRules();
  }
  if(buildId!==buildVersion||runVersion!==buildRun||draft!==completedInvention)return;
  if(plannedBuild){plannedBuild.actualKey=inventionKey(draft);if(nextFor===plannedBuild.key)nextFor=plannedBuild.actualKey;}
  startingNew=false;saveIdeas();showCard();$('#speed').textContent=`Built in ${((performance.now()-startTime)/1000).toFixed(1)}s`;
  $<HTMLTextAreaElement>('#prompt').value='';$<HTMLTextAreaElement>('#prompt').placeholder='Describe a change…';wordWorkshop.refresh();
  const equippedName=completedInvention.name;view.endConstruction();equipDraft(false);if(draft){$('#build-notice').textContent='Invention saved · Update its description';$('#build-notice').classList.remove('hidden');}say(draft?'Saved to inventory. Check this round’s rule.':equippedName+' equipped. I for inventory.');
 }catch(e){
  if(buildId===buildVersion&&runVersion===buildRun&&(e as Error).name!=='AbortError'){
   $('#error').textContent=(e as Error).message;$('#error').classList.remove('hidden');$('#build-notice').textContent='Build needs another try · Open';
  }
 }finally{
  clearInterval(ticker);
  if(buildId===buildVersion){
   busy=false;controller=null;view.endConstruction();$('#generation').classList.add('hidden');
   for(const selector of ['#invent','#equip','#starter'])$(selector).removeAttribute('disabled');
   if(!draft&&$('#error').classList.contains('hidden'))$('#build-notice').classList.add('hidden');wordWorkshop.refresh();
  }
 }
}
$('#form').onsubmit=event=>{event.preventDefault();const prompt=$<HTMLTextAreaElement>('#prompt').value.trim();if(prompt)void buildInvention(prompt,startingNew?null:(draft||spec||previousForRule));};
$('#cancel').onclick=cancelBuild;
$('#build-notice').onclick=()=>{if(draft&&!busy&&legality(draft)?.allowed!==false)$('#equip').click();else craft();};
$<HTMLInputElement>('#sensitivity').oninput=e=>{sensitivity=Number((e.target as HTMLInputElement).value);$('#sensitivity-value').textContent=sensitivity.toFixed(1);};
$<HTMLInputElement>('#motion').onchange=e=>view.motion=(e.target as HTMLInputElement).checked;
$<HTMLInputElement>('#sound').onchange=e=>sound.enabled=(e.target as HTMLInputElement).checked;
function use(){
 if(mode!=='play')return;if(!spec){craft();return;}
 if(sim.phaseDone&&sim.keyOwner==='player'&&spec.phases.some(p=>p.actions.some(a=>a.op==='deliver'))){say('Key delivered. Head to the gate.');return;}
 const verdict=legality(spec);if(verdict&&!verdict.allowed){say(verdict.reason);void checkInventoryRules();return;}
 if(spec.code){if(!sim.extension)attachCode();sim.activate();sound.use();if(sim.extension?.status)say(sim.extension.status);return;}
 sim.activate();if(sim.inventionActive){sound.use();say(spec.usage);}else say('Stopped. Press F to restart.');
}
function look(dx:number,dy:number){if(!ready||mode!=='play')return;view.yaw-=dx*.002*sensitivity;view.pitch=Math.max(-1.4,Math.min(1.4,view.pitch-dy*.002*sensitivity));}
document.addEventListener('pointerlockchange',()=>{
 edgeTurn=0;mouseReady=false;
 if(document.pointerLockElement){
  if(voiceWorkshop?.active){voiceReleasePending=true;fallbackLook=true;document.exitPointerLock();return;}
  if(mode!=='play'){fallbackLook=true;document.exitPointerLock();return;}
  fallbackLook=false;
 }else if(mode==='play'){
  if(voiceReleasePending){voiceReleasePending=false;fallbackLook=true;return;}
  if(performance.now()<voiceEscapeUntil){fallbackLook=true;return;}
  if(voiceWorkshop?.active){voiceWorkshop.cancel();voiceEscapeUntil=performance.now()+300;escapeHandledUntil=voiceEscapeUntil;fallbackLook=true;$<HTMLTextAreaElement>('#prompt').focus();return;}
  if(workbenchOpen||inventoryOpen){escapeHandledUntil=performance.now()+250;fallbackLook=true;workbenchOpen=false;inventoryOpen=false;showMode('play');}
  else if(performance.now()<escapeHandledUntil){fallbackLook=true;}
  else if(!fallbackLook)showMode('pause');
 }
});
window.addEventListener('mousemove',e=>{
 if(mode!=='play'||inventoryOpen||(workbenchOpen&&(e.target as HTMLElement).closest('#workshop')))return;
 if(workbenchOpen&&document.activeElement?.tagName==='TEXTAREA')return;
 if(document.pointerLockElement){look(e.movementX,e.movementY);return;}
 if(fallbackLook){if(mouseReady)look(e.movementX,e.movementY);mouseReady=true;const margin=32;edgeTurn=e.clientX<margin?-(1-e.clientX/margin):e.clientX>innerWidth-margin?(e.clientX-(innerWidth-margin))/margin:0;}
});
$('#stage').onpointerdown=()=>{if(mode==='play'&&!workbenchOpen&&!inventoryOpen)void captureMouse();};
function inputKey(e:KeyboardEvent){
 const codes:Record<string,string>={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',KeyQ:'q',KeyC:'c',KeyE:'e',KeyF:'f',KeyR:'r',KeyT:'t',KeyH:'h',KeyI:'i',Space:' ',Escape:'escape',Enter:'enter',ShiftLeft:'shift',ShiftRight:'shift',ArrowUp:'arrowup',ArrowDown:'arrowdown',ArrowLeft:'arrowleft',ArrowRight:'arrowright'};
 return codes[e.code]||e.key.toLowerCase();
}
window.addEventListener('keydown',e=>{
 if(voiceWorkshop?.active&&e.key==='Escape')voiceEscapeUntil=performance.now()+300;
 if(voiceWorkshop?.handleKey(e))return;
 const target=e.target instanceof HTMLElement?e.target:document.body,typing=target.matches('textarea,input,[contenteditable=true]');
 if(e.key==='Escape'&&performance.now()<escapeHandledUntil){e.preventDefault();return;}
 if(e.key==='Escape'&&(inventoryOpen||workbenchOpen))escapeHandledUntil=performance.now()+250;
 if(typing){
  if(e.key==='Escape'){e.preventDefault();void play();}
  else if(target.id==='prompt'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();$<HTMLFormElement>('#form').requestSubmit();}
  return;
 }
 if(e.metaKey||e.ctrlKey||e.altKey)return;
 const k=inputKey(e);
 if(k==='tab'&&mode!=='play'){
  const panel=$(mode==='intro'?'#menu':mode==='pause'?'#pause':'#result');
  const controls=[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input,summary,a[href],[tabindex="0"]')].filter(item=>item.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(first&&(!panel.contains(target)||(e.shiftKey?target===first:target===last)||target===panel)){e.preventDefault();(e.shiftKey?last:first)?.focus();}
  return;
 }
 if(inventoryOpen&&mode==='play'){
  if(k==='escape'||k==='i'){e.preventDefault();void play();return;}
  if(k==='e'){e.preventDefault();craft();return;}
  if(['arrowup','arrowdown','w','s'].includes(k)){e.preventDefault();inventorySelection=(inventorySelection+(['arrowup','w'].includes(k)?-1:1)+inventory.length)%Math.max(1,inventory.length);drawInventory();document.querySelector('.inventory-item.highlighted')?.scrollIntoView({block:'nearest'});return;}
  const slot=/^[1-9]$/.test(e.key)?Number(e.key)-1:k==='enter'?inventorySelection:-1;
  if(slot>=0&&inventory[slot]){e.preventDefault();chooseInventory(slot);return;}
  return;
 }if(e.repeat&&['e','f','r','t','h','i',' ','escape'].includes(k))return;
 if(k==='e'){e.preventDefault();if(mode==='result'){reset();craft();return;}if(workbenchOpen)void play();else if(mode==='play'||mode==='pause')craft();return;}
 if(k==='enter'&&target.closest('button,summary,a'))return;
 if(k==='enter'&&mode==='result'){e.preventDefault();const action=resultPrimaryAction(roundResultInput());if(action)$('#'+action).click();return;}
 if(k==='c'&&mode==='intro'&&!$('#continue-run').classList.contains('hidden')){e.preventDefault();continueSavedRun();return;}
 if(k==='enter'&&(mode==='pause'||mode==='intro')){e.preventDefault();if(mode==='intro'){if(target.id==='continue-run')continueSavedRun();else startFreshRun();}else void play();return;}
 if(k==='escape'&&(mode==='pause'||mode==='result')){e.preventDefault();if(mode==='pause')void play();else showMode('intro');return;}
 if(k==='r'&&(mode==='result'||mode==='pause')){e.preventDefault();reset();void play();return;}
 if(k==='i'&&mode==='result'){e.preventDefault();reset();openInventory();return;}
 if(mode!=='play')return;
 if(k==='i'){e.preventDefault();if(inventoryOpen)void play();else openInventory();return;}
 if(k==='h'){e.preventDefault();$('#hud').classList.toggle('help-open');return;}
 if(k==='t'){e.preventDefault();equipSample();return;}
 if(k==='r'){e.preventDefault();reset();return;}
 if(k==='f'){e.preventDefault();use();return;}
 if(k==='escape'){e.preventDefault();if(workbenchOpen||inventoryOpen)void play();else showMode('pause');return;}
 if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
 keys.add(k);if(k===' ')sim.jump();
});
window.addEventListener('keyup',e=>keys.delete(inputKey(e)));
document.addEventListener('focusin',e=>{if((e.target as HTMLElement).matches('textarea,input,[contenteditable=true]'))keys.clear();});
window.addEventListener('blur',()=>{keys.clear();if(mode==='play'&&!voiceWorkshop?.requesting)showMode('pause');});
const map:Record<string,string>={left:'a',right:'d',up:'w',down:'s'};for(const b of document.querySelectorAll<HTMLButtonElement>('[data-dir]')){b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);keys.add(map[b.dataset.dir!]);};b.onpointerup=b.onpointercancel=()=>keys.delete(map[b.dataset.dir!]);}$('#touch-invent').onclick=craft;$('#touch-use').onclick=use;
try{await initPhysics();sim=new Simulation();view=new GameView($('#stage'));view.renderer.domElement.tabIndex=-1;preview=new InventionPreview($('#preview'));try{const saved=JSON.parse(localStorage.getItem('badidea-inventions-v1')||'null');if(saved){level=([0,1,2].includes(saved.level)?saved.level:0) as LevelId;spec=saved.spec?prepareInvention(saved.spec):null;draft=saved.draft?prepareInvention(saved.draft):null;}}catch{/* Ignore invalid saved drafts. */}try{const run=JSON.parse(localStorage.getItem('badidea-run-v1')||'null');if(run){arena=run.arena?normalizeArenaRules(arenaSchema.parse(run.arena)):null;nextArena=run.nextArena?normalizeArenaRules(arenaSchema.parse(run.nextArena)):null;collectedWords=Array.isArray(run.collectedWords)?run.collectedWords.filter((word:unknown):word is string=>typeof word==='string'):[];lastInventoryResetRound=Number.isInteger(run.lastInventoryResetRound)?run.lastInventoryResetRound:arena?.inventoryReset?arena.round:null;roomHistory=readRoomHistory(run.roomHistory);nextFor=run.nextFor||'';plannedBuild=run.plannedBuild||null;if(plannedBuild&&!plannedBuild.actualKey)plannedBuild=null;previousForRule=run.previousForRule||null;spec=run.spec?prepareInvention(run.spec):null;draft=run.draft?prepareInvention(run.draft):null;if(arena)level=0;}else{arena={...firstArena};spec=null;draft=null;level=0;}}catch{arena={...firstArena};spec=null;draft=null;level=0;}try{const run=JSON.parse(localStorage.getItem('badidea-run-v1')||'null');inventory=(Array.isArray(run?.inventory)?run.inventory:JSON.parse(localStorage.getItem('badidea-inventory-v1')||'[]')).map((entry:{item:unknown,prompt?:unknown})=>{const item=prepareInvention(entry.item);return {key:inventionKey(item),item,prompt:typeof entry.prompt==='string'?entry.prompt:undefined};});}catch{inventory=[];}if(spec)remember(spec);
if(spec||draft||nextArena||!arena||(arena&&arena.round>1))savedSession=snapshotRun();
updateContinue();
arena=structuredClone(firstArena);collectedWords=[];lastInventoryResetRound=null;nextArena=null;roomHistory=[];nextFor='';plannedBuild=null;previousForRule=null;spec=null;draft=null;level=0;
sim.dispose();sim=new Simulation(level,arena);if(arena)view.setArena(arena);else view.setLevel(level);ready=true;$('#enter').removeAttribute('disabled');view.yaw=-Math.PI/2;view.pitch=-.06;let last=performance.now(),acc=0,eventCount=0;
 function frame(now:number){const delta=Math.min((now-last)/1000,.08);last=now;if(mode==='play'){if(fallbackLook&&!document.pointerLockElement&&!workbenchOpen&&!inventoryOpen)view.yaw-=Math.max(-1,Math.min(1,edgeTurn))*2.2*delta;sim.aim={x:-Math.sin(view.yaw)*Math.cos(view.pitch),y:Math.sin(view.pitch),z:-Math.cos(view.yaw)*Math.cos(view.pitch)};if(keys.has('q'))view.yaw+=2*delta;if(keys.has('c'))view.yaw-=2*delta;acc+=delta;let forward=0,side=0;if(keys.has('w')||keys.has('arrowup'))forward++;if(keys.has('s')||keys.has('arrowdown'))forward--;if(keys.has('a')||keys.has('arrowleft'))side--;if(keys.has('d')||keys.has('arrowright'))side++;const length=Math.hypot(forward,side)||1,speed=keys.has('shift')?4.5:3.2;sim.manual={x:(-Math.sin(view.yaw)*forward+Math.cos(view.yaw)*side)/length*speed,y:0,z:(-Math.cos(view.yaw)*forward-Math.sin(view.yaw)*side)/length*speed};while(acc>=1/60){sim.tick();wordPickups?.step();if(sim.landingSpeed>1)sound.land();sound.tick(Math.hypot(sim.player.linvel().x,sim.player.linvel().z),sim.grounded,1/60);acc-=1/60;}
  $('#danger').classList.toggle('hidden',sim.alert<=0);$('#danger i').style.width=`${sim.alert*100}%`;
  let hint='';const actions=spec?.phases.flatMap(p=>p.actions)||[],p=sim.position;
  if(sim.level===1&&p.x>-3&&p.x<0)hint='GAP AHEAD · E to invent · R to retry';
  if(sim.level===2&&p.x>1&&p.x<4)hint='EXIT ABOVE · Reach the green doorway on the roof';
  if(sim.frozen>0&&sim.keyOwner==='guard'&&sim.level===0)hint='GUARD FROZEN · Walk close to take the key';
  if(sim.invisible)hint='HIDDEN · Get close to pickpocket the key · F to reveal';
  if(sim.climbing)hint='CLIMBING · Keep holding forward';
  else if(actions.some(a=>a.op==='climb')&&Math.hypot(p.x-sim.self.x,p.z-sim.self.z)<2)hint=sim.inventionActive?'Hold forward toward the ladder to climb':'F · Activate ladder';
  if(actions.some(a=>a.op==='bounce')&&Math.hypot(p.x-sim.self.x,p.z-sim.self.z)<2)hint='SPACE · Jump onto the center of the pad';
  if(actions.some(a=>a.op==='freezeRay')&&sim.keyOwner==='guard'){
   const g=sim.target('guard'),dx=g.x-p.x,dy=g.y-p.y-.86,dz=g.z-p.z,len=Math.hypot(dx,dy,dz),onAim=(dx*sim.aim.x+dy*sim.aim.y+dz*sim.aim.z)/(len||1)>.965;
   hint=len>5?'Get within 5m of the guard':onAim?'F · Freeze guard':'Aim at the guard, then F';
  }
  if(sim.frozen>0&&sim.keyOwner==='guard'&&sim.level===0)hint='GUARD FROZEN · Walk close to take the key';
  if(!arena&&sim.level===0&&!sim.gateOpen&&Math.hypot(p.x-4,p.z)<2.8)hint=sim.keyOwner==='player'?'KEY READY · Walk up to the gate':'GATE LOCKED · The guard has the key';
  if(arena)hint=sim.disrupted>0?'Recovering · Keep moving':getLanguageRule(arena)?.wordBank?'Walk into blue words to unlock them':arena.rule.restriction||getLanguageRule(arena)?arena.rule.title:'';$('#interaction').textContent=hint;
  if(sim.events.length>eventCount){say(sim.events.at(-1)!);eventCount=sim.events.length;}
  if(sim.state==='running'){const ph=spec?.phases[sim.phase];$('#phase-label').textContent=spec?.code?(sim.extension?.error?'Repairing invention':sim.extension?.status||(sim.extension?spec.usage:'F · Activate')):sim.inventionActive?(ph&&!sim.phaseDone?ph.label+' · F to stop':(sim.keyOwner==='player'?'Head for the gate':'F to use again')):(spec?'F to activate':'Press E to open your imagination');if(!arena&&sim.level===0&&sim.gateOpen){$('#objective').textContent='WAY OPEN. GET OUT.';$('#subobjective').textContent='Head through the opening and reach the exit.';}else if(!arena&&sim.level===0&&sim.keyOwner==='player'){$('#objective').textContent=sim.gateOpen?'GATE OPEN. GET OUT.':'YOU HAVE THE KEY';$('#subobjective').textContent='Walk up to the gate. Freedom is on the other side.';}}

  if(sim.state==='won'||sim.state==='lost'){
   workbenchOpen=false;inventoryOpen=false;const won=sim.state==='won';
   showCounter();showMode('result');
   if(arena&&won&&!nextArena&&!directorBusy&&!directorError)void prepareNext();
   if(won){unlocked=Math.max(unlocked,Math.min(3,level+1));try{localStorage.setItem('badidea-progress',String(unlocked));}catch{}drawChapters();if(!arena)view.celebrate();}
  }

 }else{acc=0;eventCount=sim.events.length;}
 $('#bubble').classList.toggle('hidden',now>noticeUntil||mode!=='play');wordPickups?.render(view.camera,sim.elapsed);view.render(sim,delta,mode==='play'?acc*60:1,mode==='play');if(workbenchOpen&&mode==='play')preview.render();requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}catch(e){$('#enter').textContent='3D failed to start: '+(e as Error).message;$('#enter').setAttribute('disabled','');}
fetch('/api/health').then(r=>r.json()).then(d=>{$('.connection span').textContent=d.ready?'ASTRA ONLINE':'ASTRA OFFLINE';$('.connection').classList.toggle('online',d.ready);}).catch(()=>{$('.connection span').textContent='WORKSHOP OFFLINE';});
