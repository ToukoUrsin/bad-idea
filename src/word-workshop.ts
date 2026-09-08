import {getLanguageRule,promptRuleViolation} from './prompt-rules';
import type {Arena} from './arena';
import './word-workshop.css';

// The same validator runs here and on the server; the player sees a mistake before building.
export class WordWorkshop {
 private prompt=document.querySelector<HTMLTextAreaElement>('#prompt')!;
 private build=document.querySelector<HTMLButtonElement>('#invent')!;
 private feedback=document.createElement('p');
 private bank=document.createElement('section');
 private progress=document.createElement('span');
 constructor(private state:()=>{arena:Arena|null,collectedWords:string[],busy:boolean}){
  this.feedback.id='prompt-rule-feedback';this.feedback.setAttribute('aria-live','polite');
  this.prompt.setAttribute('aria-describedby','room-rule prompt-rule-feedback');
  this.prompt.after(this.feedback);this.bank.id='word-bank';this.bank.className='hidden';
  document.querySelector('#room-rule')!.after(this.bank);
  this.progress.id='word-progress';this.progress.className='hidden';
  document.querySelector('#active-rule')!.after(this.progress);
  this.prompt.addEventListener('input',()=>this.refresh());
 }
 refresh(){
  const {arena,collectedWords,busy}=this.state(),rule=getLanguageRule(arena),bank=rule?.wordBank;
  const violation=rule&&this.prompt.value.trim()?promptRuleViolation(this.prompt.value,rule,collectedWords):null;
  this.feedback.textContent=violation||(rule?'This rule applies to your description.':'');
  this.feedback.classList.toggle('hidden',!rule);this.feedback.classList.toggle('invalid',!!violation);
  this.prompt.setAttribute('aria-invalid',String(!!violation));this.build.disabled=busy||!!violation;
  this.prompt.placeholder=bank?'Choose words you have unlocked…':rule?'Describe your invention using this round’s rule…':this.prompt.placeholder;
  this.bank.classList.toggle('hidden',!bank);this.progress.classList.toggle('hidden',!bank);
  this.bank.replaceChildren();
  if(bank){
   const found=bank.pickups.filter(word=>collectedWords.includes(word));
   this.progress.textContent=`Words found ${found.length} / ${bank.pickups.length} · Walk into blue words to collect`;
   const heading=document.createElement('h3');heading.textContent='Your words';
   const help=document.createElement('p');help.textContent='Use these words as often as you like. Collect blue words in the room to unlock more.';
   const available=document.createElement('div');available.className='word-chips';
   for(const word of [...bank.starterWords,...found]){
    const button=document.createElement('button');button.type='button';button.textContent=word;button.disabled=busy;
    button.onclick=()=>{
     const start=this.prompt.selectionStart,end=this.prompt.selectionEnd;
     const before=this.prompt.value.slice(0,start),after=this.prompt.value.slice(end);
     const text=(before&&!/\s$/.test(before)?' ':'')+word+(after&&!/^\s/.test(after)?' ':'');
     if(this.prompt.value.length-(end-start)+text.length>this.prompt.maxLength)return;
     this.prompt.setRangeText(text,start,end,'end');this.prompt.focus();this.refresh();
    };available.append(button);
   }
   const locked=document.createElement('div');locked.className='word-chips locked-words';
   for(const word of bank.pickups.filter(word=>!found.includes(word))){const chip=document.createElement('span');chip.textContent=word;chip.title='Find this word in the room';locked.append(chip);}
   this.bank.append(heading,help,available);
   if(locked.childElementCount){const label=document.createElement('p');label.textContent='Still in the room';this.bank.append(label,locked);}
  }
  let visibleSuggestions=0;
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-prompt]')){
   const hidden=!!rule&&!!promptRuleViolation(button.dataset.prompt||'',rule,collectedWords);
   button.classList.toggle('hidden',hidden);if(!hidden)visibleSuggestions++;
  }
  document.querySelector('.suggestions')?.classList.toggle('hidden',visibleSuggestions===0);
 }
}
