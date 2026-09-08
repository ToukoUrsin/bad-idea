import {z} from 'zod';

// This pattern is also sent as JSON Schema to Astra. Keep it portable: JSON
// Schema has no JavaScript `u` flag, and the API rejects Unicode property escapes.
const wordSchema=z.string().min(1).max(30).regex(/^[a-zA-Z]+(?:['’][a-zA-Z]+)*$/,'Use a single English word or contraction.');
const canonical=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'");
const wordsIn=(text:string)=>canonical(text).match(/[\p{L}]+(?:'[\p{L}]+)*/gu)||[];
const hasDuplicates=(words:string[])=>new Set(words.map(canonical)).size!==words.length;

/** Restrictions apply to the player's description, never generated names or code. */
export const languageRuleSchema=z.object({
 bannedLetters:z.array(z.string().regex(/^[a-zA-Z]$/)).max(3),
 bannedWords:z.array(wordSchema).max(12),
 wordBank:z.object({starterWords:z.array(wordSchema).min(1).max(40),pickups:z.array(wordSchema).min(1).max(8)}).nullable(),
}).superRefine((rule,ctx)=>{
 if(hasDuplicates(rule.bannedLetters))ctx.addIssue({code:'custom',path:['bannedLetters'],message:'Each banned letter must be unique.'});
 if(hasDuplicates(rule.bannedWords))ctx.addIssue({code:'custom',path:['bannedWords'],message:'Each banned word must be unique.'});
 if(!rule.wordBank)return;
 const all=[...rule.wordBank.starterWords,...rule.wordBank.pickups];
 if(hasDuplicates(all))ctx.addIssue({code:'custom',path:['wordBank'],message:'Starter words and pickups must all be unique.'});
 const letters=rule.bannedLetters.map(canonical),banned=new Set(rule.bannedWords.map(canonical));
 if(all.some(word=>banned.has(canonical(word))||letters.some(letter=>canonical(word).includes(letter)))){
  ctx.addIssue({code:'custom',path:['wordBank'],message:'Every starter word and pickup must be usable under the letter and word bans.'});
 }
});
export type LanguageRule=z.infer<typeof languageRuleSchema>;
export const emptyLanguageRule=():LanguageRule=>({bannedLetters:[],bannedWords:[],wordBank:null});
export function normalizeLanguageRule(rule:LanguageRule):LanguageRule{
 return {bannedLetters:rule.bannedLetters.map(canonical),bannedWords:rule.bannedWords.map(canonical),wordBank:rule.wordBank?{starterWords:rule.wordBank.starterWords.map(canonical),pickups:rule.wordBank.pickups.map(canonical)}:null};
}
export function getLanguageRule(arena:{round:number,rule:{language?:LanguageRule}}|null|undefined):LanguageRule|null{
 const rule=arena?.rule.language;
 if(!arena||arena.round<4||!rule||(!rule.bannedLetters.length&&!rule.bannedWords.length&&!rule.wordBank))return null;
 return normalizeLanguageRule(rule);
}

/** A client can report collected pickups only from this room's current bank. */
export function collectedWordsForRule(rule:LanguageRule|null,words:readonly string[]=[]):string[]{
 if(!rule?.wordBank)return [];
 const available=new Set(rule.wordBank.pickups.map(canonical));
 return [...new Set(words.map(canonical).filter(word=>available.has(word)))];
}

export function promptRuleViolation(prompt:string,rule:LanguageRule|null,unlockedWords:readonly string[]=[]):string|null{
 if(!rule)return null;
 const normalized=normalizeLanguageRule(rule),text=canonical(prompt);
 const letter=normalized.bannedLetters.find(letter=>text.includes(letter));
 if(letter)return `Your description cannot use the letter “${letter.toUpperCase()}”.`;
 const words=wordsIn(prompt),banned=new Set(normalized.bannedWords),word=words.find(word=>banned.has(word));
 if(word)return `Your description cannot use the word “${word}”.`;
 if(normalized.wordBank){
  const allowed=new Set([...normalized.wordBank.starterWords,...collectedWordsForRule(normalized,unlockedWords)]);
  if(!words.length)return 'Describe your invention using words from your word bank.';
  const locked=[...new Set(words.filter(word=>!allowed.has(word)))];
  if(locked.length){
   const examples=locked.slice(0,2).map(word=>`“${word}”`).join(', '),extra=locked.length>2?' and more':'';
   return `Words not unlocked: ${examples}${extra}. Use your word bank or collect more words.`;
  }
 }
 return null;
}

export function languageRuleText(rule:LanguageRule|null):string{
 if(!rule)return '';
 const parts:string[]=[];
 if(rule.bannedLetters.length)parts.push(`Describe your invention without ${rule.bannedLetters.length===1?'the letter':'the letters'} ${rule.bannedLetters.map(letter=>`“${letter.toUpperCase()}”`).join(', ')}.`);
 if(rule.bannedWords.length)parts.push(`Your description cannot use ${rule.bannedWords.map(word=>`“${word}”`).join(', ')}.`);
 if(rule.wordBank)parts.push('Describe your invention using only unlocked words. Pick up words in the room to unlock them.');
 return parts.join(' ');
}

export function languageInventoryVerdict(prompt:string|undefined,rule:LanguageRule|null,unlockedWords:readonly string[]=[]):{allowed:boolean,reason:string}|null{
 if(!rule)return null;
 const reason=typeof prompt==='string'&&prompt.trim()?promptRuleViolation(prompt,rule,unlockedWords):'Describe this invention again to follow this round’s word rule.';
 return {allowed:!reason,reason:reason||''};
}

export function mergeLanguageVerdicts(inventory:readonly {key:string,prompt?:string}[],semanticVerdicts:readonly {key:string,allowed:boolean,reason:string}[],rule:LanguageRule|null,unlockedWords:readonly string[]=[]){
 const semantic=new Map(semanticVerdicts.map(verdict=>[verdict.key,verdict]));
 return inventory.map(item=>{
  const language=languageInventoryVerdict(item.prompt,rule,unlockedWords);
  return language&&!language.allowed?{key:item.key,...language}:semantic.get(item.key)||{key:item.key,allowed:false,reason:'This invention still needs a rule check.'};
 });
}
