import type {LevelId} from '../src/levels';
import {prepareInvention} from '../src/spec';
import {starters} from '../src/starters';

export const replayCases:Record<string,{fixture?:string;starter?:LevelId;level:LevelId;coded:boolean}>={
 'rpg-code':{fixture:'code/rpg.json',level:0,coded:true},
 'vine-code':{fixture:'code/vine.json',level:1,coded:true},
 'gravity-code':{fixture:'code/gravity.json',level:0,coded:true},
 gap:{starter:1,level:1,coded:false},
 rooftop:{starter:2,level:2,coded:false},
 bird:{fixture:'playtest/bird.json',level:0,coded:false},
 'freeze-ray':{fixture:'playtest/freeze-ray.json',level:0,coded:false},
 ladder:{fixture:'playtest/ladder.json',level:0,coded:false},
 grapple:{fixture:'playtest/grapple.json',level:0,coded:false},
 cloak:{fixture:'playtest/cloak.json',level:0,coded:false},
 trampoline:{fixture:'playtest/trampoline.json',level:0,coded:false},
};

export async function loadReplayCase(kind:string,fetchFixture:typeof fetch=fetch){
 const replay=Object.hasOwn(replayCases,kind)?replayCases[kind]:undefined;
 if(!replay)throw new Error(`Unknown replay: ${kind}`);
 if(replay.starter!==undefined)return {...replay,invention:prepareInvention(starters[replay.starter])};
 const response=await fetchFixture(`/tests/fixtures/${replay.fixture}`);
 if(!response.ok)throw new Error(`Could not load ${kind} replay (HTTP ${response.status}).`);
 if(!response.headers.get('content-type')?.includes('application/json'))throw new Error(`Could not load ${kind} replay: expected a JSON fixture.`);
 let data;
 try{data=await response.json();}catch{throw new Error(`Could not load ${kind} replay: the fixture contains invalid JSON.`);}
 return {...replay,invention:prepareInvention(data?.invention)};
}
