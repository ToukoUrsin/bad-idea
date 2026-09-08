import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadReplayCase,replayCases} from './replay-fixtures';

test('every replay dropdown option loads its fixture or starter with the expected behavior type',async()=>{
 const html=await fs.readFile(new URL('../playtest.html',import.meta.url),'utf8');
 const options=[...html.matchAll(/<option(?: value="([^"]+)")?>([^<]+)<\/option>/g)].map(match=>match[1]||match[2]);
 assert.deepEqual(options.sort(),Object.keys(replayCases).sort());
 const fetchFixture:typeof fetch=async input=>{
  const path=String(input);
  assert.ok(path.startsWith('/tests/fixtures/'));
  const fixture=await fs.readFile(new URL('..'+path,import.meta.url),'utf8');
  return new Response(fixture,{headers:{'content-type':'application/json'}});
 };
 for(const kind of options){
  const replay=await loadReplayCase(kind,fetchFixture);
  assert.equal(Boolean(replay.invention.code),replay.coded,kind);
  if(!replay.coded)assert.ok(replay.invention.phases.some(phase=>phase.actions.length>0),kind);
 }
 assert.equal((await loadReplayCase('vine-code',fetchFixture)).level,1);
 assert.equal((await loadReplayCase('gap',fetchFixture)).level,1);
 assert.equal((await loadReplayCase('rooftop',fetchFixture)).level,2);
});

test('missing replay fixtures report a useful error even when the dev server falls back to HTML',async()=>{
 await assert.rejects(loadReplayCase('rpg-code',async()=>new Response('<!doctype html>',{headers:{'content-type':'text/html'}})),/expected a JSON fixture/);
 await assert.rejects(loadReplayCase('bird',async()=>new Response('missing',{status:404})),/HTTP 404/);
 await assert.rejects(loadReplayCase('bird',async()=>new Response('{',{headers:{'content-type':'application/json'}})),/invalid JSON/);
 await assert.rejects(loadReplayCase('unknown'),/Unknown replay/);
});
