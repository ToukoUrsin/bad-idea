import {VoiceCapture} from './voice-capture';
import './voice-workshop.css';

type WorkshopOptions={open:()=>void,available:()=>boolean,refresh:()=>void};

export class VoiceWorkshop {
 private prompt=document.querySelector<HTMLTextAreaElement>('#prompt')!;
 private form=document.querySelector<HTMLFormElement>('#form')!;
 private button=document.createElement('button');
 private cancelButton=document.createElement('button');
 private status=document.createElement('p');
 private controls=document.createElement('div');
 private original='';
 private selection=[0,0];
 private startedAt=0;
 private ticker:ReturnType<typeof setInterval>|undefined;
 private capture:VoiceCapture;

 constructor(private options:WorkshopOptions){
  this.capture=new VoiceCapture({
   onState:state=>{
    const active=state!=='idle';
    this.prompt.readOnly=active;
    this.form.classList.toggle('voice-active',active);
    this.form.setAttribute('aria-busy',String(state==='transcribing'));
    this.button.setAttribute('aria-pressed',String(state==='recording'));
    this.button.disabled=state==='requesting'||state==='transcribing';
    this.cancelButton.classList.toggle('hidden',!active);
    clearInterval(this.ticker);this.ticker=undefined;
    this.status.classList.remove('voice-error');
    if(state==='requesting'){
     this.button.textContent='Opening mic…';this.status.textContent='Allow microphone access to describe your invention. Esc cancels.';
    }else if(state==='recording'){
     this.button.textContent='Stop recording · V';this.startedAt=Date.now();
     const update=()=>{this.status.textContent=`Listening · ${Math.floor((Date.now()-this.startedAt)/1000)} / 60s · Press V to finish, Esc to cancel.`;};
     update();this.ticker=setInterval(update,1000);this.button.focus({preventScroll:true});
    }else if(state==='transcribing'){
     this.button.textContent='Writing your words…';this.status.textContent='Turning your recording into text. Esc cancels.';
    }else{
     this.button.textContent='Speak idea · V';this.status.textContent='Press V from the room to speak, or use this button.';
    }
    this.options.refresh();
   },
   onText:text=>{
    // Do not replace edits made by another workshop action while a request was pending.
    if(this.prompt.value!==this.original){this.status.textContent='Your description changed. Speak again to add to it.';return;}
    const [start,end]=this.selection,before=this.original.slice(0,start),after=this.original.slice(end);
    const insertion=(before&&!/\s$/.test(before)?' ':'')+text+(after&&!/^\s/.test(after)?' ':'');
    const value=before+insertion+after;
    // Keep every dictated word for review; the existing 1,200-character limit still applies on submit.
    this.prompt.value=value;
    this.prompt.setSelectionRange(start+insertion.length,start+insertion.length);
    this.prompt.dispatchEvent(new Event('input',{bubbles:true}));
    this.prompt.focus({preventScroll:true});
    this.status.textContent=value.length>this.prompt.maxLength?'Your idea is too long. Shorten it to 1,200 characters before building.':'Ready to review · Enter builds · Speak again to add more.';
   },
   onError:message=>{
    this.status.textContent=message;this.status.classList.add('voice-error');
    this.prompt.focus({preventScroll:true});
   },
  });
  this.controls.className='voice-tools';
  this.button.type='button';this.button.id='voice-toggle';this.button.textContent='Speak idea · V';
  this.button.setAttribute('aria-controls','prompt');this.button.setAttribute('aria-pressed','false');
  this.button.setAttribute('aria-keyshortcuts','V');
  this.button.onclick=()=>this.toggle();
  this.cancelButton.type='button';this.cancelButton.textContent='Cancel';this.cancelButton.className='hidden';
  this.cancelButton.onclick=()=>this.cancel();
  this.controls.append(this.button,this.cancelButton);this.prompt.before(this.controls);
  this.status.id='voice-status';this.status.className='voice-status';this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');
  this.status.textContent=this.capture.supported?'Press V from the room to speak, or use this button.':'Voice needs a browser with microphone support on localhost or HTTPS. You can still type.';
  this.button.disabled=!this.capture.supported;
  this.prompt.after(this.status);
  this.prompt.setAttribute('aria-describedby',[this.prompt.getAttribute('aria-describedby'),'voice-status'].filter(Boolean).join(' '));
  const note=document.createElement('small');note.className='voice-privacy';note.textContent='Recordings are sent to OpenAI for transcription when you finish.';this.controls.after(note);
  this.form.addEventListener('submit',event=>{
   if(this.active){event.preventDefault();event.stopImmediatePropagation();this.capture.stop();return;}
   if(this.prompt.value.length>this.prompt.maxLength){event.preventDefault();event.stopImmediatePropagation();this.status.textContent='Shorten your idea to 1,200 characters before building.';this.prompt.focus();}
  },true);
  document.querySelector('#workshop')!.addEventListener('click',event=>{
   if((event.target as HTMLElement).closest('#new-idea,#starter,#discard,#equip,[data-prompt],#word-bank button'))this.cancel();
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();});
  window.addEventListener('pagehide',()=>this.cancel());
 }

 get active(){return this.capture.state!=='idle';}
 get requesting(){return this.capture.state==='requesting';}

 toggle(){
  if(this.active){this.capture.stop();return;}
  if(!this.options.available())return;
  this.original=this.prompt.value;this.selection=[this.prompt.selectionStart,this.prompt.selectionEnd];
  this.options.open();
  void this.capture.start();
 }

 cancel(){
  if(!this.active)return;
  this.capture.cancel();this.status.textContent='Recording cancelled. Your description is unchanged.';
 }

 /** Run before movement/typing shortcuts so V never becomes part of the recording's prompt. */
 handleKey(event:KeyboardEvent){
  if(event.isComposing)return false;
  const target=event.target instanceof HTMLElement?event.target:null;
  const typing=!!target?.matches('textarea,input,[contenteditable=true]');
  if(this.active){
   if(event.key==='Enter'&&target?.closest('button'))return false;
   if(event.key==='Escape'){event.preventDefault();this.cancel();this.prompt.focus({preventScroll:true});return true;}
   if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.code==='KeyV'||event.key==='Enter')){
    event.preventDefault();if(!event.repeat)this.capture.stop();return true;
   }
   // Keep movement and room shortcuts from changing the run while speaking.
   return event.key!=='Tab'&&!event.ctrlKey&&!event.metaKey&&!event.altKey;
  }
  if(!typing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.code==='KeyV'||event.key.toLowerCase()==='v')&&this.options.available()){
   event.preventDefault();if(!event.repeat)this.toggle();return true;
  }
  return false;
 }
}
