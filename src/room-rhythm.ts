import {z} from 'zod';
import {getLanguageRule,languageRuleText,type LanguageRule} from './prompt-rules';

// These describe the player's physical task, not a menu of allowed room mechanics.
export const gameplaySchema=z.object({
 interaction:z.enum(['timing','navigation','precision','manipulation','construction','other']),
 mechanic:z.string().min(1).max(160),
 pressure:z.enum(['low','medium','high']),
});
export const roomMemorySchema=z.object({
 round:z.number().int().min(1).max(999),title:z.string().max(60),change:z.string().max(260),
 challengeMode:z.enum(['geometry','rules','mixed']).optional(),
 objective:z.string().max(100).optional(),restriction:z.string().max(350).optional(),languageRule:z.string().max(1200).optional(),
 gameplay:gameplaySchema.optional(),
});
export type RoomMemory=z.infer<typeof roomMemorySchema>;
type RememberedRoom=Pick<RoomMemory,'round'|'title'|'change'|'challengeMode'|'objective'|'gameplay'> & {rule?:{restriction:string,language?:LanguageRule}};

export function rememberRoom(room:RememberedRoom):RoomMemory{
 const language=getLanguageRule(room.rule?{round:room.round,rule:room.rule}:null);
 return roomMemorySchema.parse({...room,restriction:room.rule?.restriction,languageRule:language?languageRuleText(language):undefined});
}

// Old saves lack gameplay labels. Keep their descriptions without inventing labels.
export function readRoomHistory(history:unknown):RoomMemory[]{
 const rounds=new Map<number,RoomMemory>();
 for(const value of Array.isArray(history)?history:[]){
  const parsed=roomMemorySchema.safeParse(value);
  if(parsed.success)rounds.set(parsed.data.round,parsed.data);
 }
 return [...rounds.values()].sort((a,b)=>a.round-b.round).slice(-6);
}

export function recordRoomTransition(history:unknown,previous:RememberedRoom,nextRound:number):RoomMemory[]{
 const earlier=readRoomHistory(history).filter(room=>room.round<previous.round);
 return nextRound>previous.round?[...earlier,rememberRoom(previous)].slice(-6):earlier;
}

export function directorRhythm(current:RememberedRoom|undefined,history:unknown,repair=false){
 const recentRooms=current
  ?[...readRoomHistory(history).filter(room=>room.round<current.round),rememberRoom(current)].slice(-6)
  :readRoomHistory(history);
 const lastTwo=recentRooms.slice(-2);
 const avoidInteractions=[...new Set(lastTwo.flatMap(room=>room.gameplay&&room.gameplay.interaction!=='other'?[room.gameplay.interaction]:[]))];
 if(repair)return {pace:'preserve',reason:'Repair this round without changing its mechanic, pressure, objective or rule.',avoidInteractions:[],recentRooms};
 if(!current||current.round===1)return {pace:'introduce',reason:'Introduce one readable new idea with generous time to observe and experiment.',avoidInteractions,recentRooms};
 const highStreak=lastTwo.length===2&&lastTwo[0].round+1===lastTwo[1].round&&lastTwo.every(room=>room.gameplay?.pressure==='high');
 return {
  pace:highStreak?'breather':'develop',
  reason:highStreak
   ?'The last two rooms had high execution pressure. Make the next room low pressure: thoughtful invention with generous timing, not another reflex or survival test.'
   :'Develop a fresh interaction or a new use for a familiar invention. Greater strategic depth does not require greater execution pressure.',
  avoidInteractions,recentRooms,
 };
}

export const rhythmInstructions=`MECHANICAL VARIETY AND RHYTHM: The supplied rhythm is design guidance. Its recentRooms includes the current room, even before success; it is a record of challenges, not proof the player solved them. Avoid making the next room primarily about rhythm.avoidInteractions when a coherent alternative exists. Compare what the player actually does: a pulsing floor and a cycling press both primarily demand timing, regardless of their appearance. Do not merely rename a recent mechanic. The categories describe interactions; they do not limit the mechanics or code you may invent. For legacy rooms without gameplay labels, infer repetition from their descriptions and the previous room code.
Follow rhythm.pace: introduce means one clear new idea; develop means a fresh decision or deeper use of a familiar tool; breather means low execution pressure while keeping an interesting invention problem. A breather needs generous timing and room to think, without stacking lethal threats. If the previous room is high pressure, choose geometry or mixed to create a breather: a rule-only round would retain the same physical pressure. There is no fixed alternation of room types. Preserve means fix the runtime error with minimal changes, retaining the existing challenge; variety guidance must not redesign a repair.
Return gameplay describing the physical room you actually implement: interaction is its dominant player task; mechanic is one short concrete description of the action and obstacle, not its title or theme; pressure is execution/time pressure, not intellectual difficulty. Low means the player can observe and experiment without urgency; medium means a readable timed or precision demand with recovery opportunities; high means sustained urgency or several simultaneous execution demands. For rules-only rounds, physical gameplay is inherited from the previous room; explain the new invention constraint in rule, not in gameplay. Keep this metadata out of player-facing copy.`;
