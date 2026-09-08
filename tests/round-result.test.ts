import test from 'node:test';
import assert from 'node:assert/strict';
import {resultPrimaryAction, resultViewModel, type RoundResultInput} from '../src/round-result';

const nextRoom = {round: 3, title: 'A higher bar', change: 'The exit has moved above the floor.', rule: 'Wood and rope only.'};
const base: RoundResultInput = {won: true, round: 2, roomName: 'The crossing', reason: '', roomFailure: false, nextRoom: null, directorBusy: true, directorError: '', finalClassic: false};

test('a won adaptive round waits without a misleading Enter action, then offers the next room', () => {
  assert.equal(resultPrimaryAction(base), null);
  assert.equal(resultViewModel(base).status, 'waiting');
  const ready = {...base, nextRoom, directorBusy: false};
  assert.equal(resultPrimaryAction(ready), 'next-level');
  assert.equal(resultViewModel(ready).status, null);
  assert.deepEqual(resultViewModel(ready).nextRoom, nextRoom);
  assert.equal(resultViewModel(ready).nextAction, 'Enter round 3');
});

test('Enter retries failed generation but does nothing during the replacement request', () => {
  const failure = {...base, directorBusy: false, directorError: 'Network request failed'};
  assert.equal(resultPrimaryAction(failure), 'retry-director');
  assert.equal(resultViewModel(failure).status, 'error');
  const retrying = {...failure, directorBusy: true};
  assert.equal(resultPrimaryAction(retrying), null);
  assert.equal(resultViewModel(retrying).status, 'waiting');
  assert.equal(resultPrimaryAction({...failure, nextRoom}), 'next-level', 'a ready room wins over stale failure state');
});

test('ordinary losses offer a retry and never leak a pre-generated next room or director failure', () => {
  const lost = {...base, won: false, reason: 'You fell into the gap.', nextRoom, directorError: 'Service failure'};
  const view = resultViewModel(lost);
  assert.equal(view.primary, 'retry');
  assert.equal(view.nextRoom, null);
  assert.equal(view.status, null);
  assert.equal(view.copy, 'You fell into the gap.');
});

test('room runtime failures follow the repair flow instead of restarting a broken room as the primary action', () => {
  const repair = {...base, won: false, roomFailure: true, reason: 'TypeError: missing object\n at step (/generated-room.js:99)'};
  const view = resultViewModel(repair);
  assert.equal(view.state, 'repair');
  assert.equal(view.primary, null);
  assert.equal(view.statusTitle, 'Repairing the room…');
  assert.doesNotMatch(view.copy, /TypeError|generated-room/);
  assert.equal(resultPrimaryAction({...repair, directorBusy: false, directorError: 'Failed'}), 'retry-director');
  const repaired = resultViewModel({...repair, nextRoom: {...nextRoom, round: 2}});
  assert.equal(repaired.primary, 'next-level');
  assert.equal(repaired.nextAction, 'Enter repaired room');
  assert.equal(repaired.status, null);
  assert.equal(repaired.copy, 'A fresh version of the room is ready.');
});

test('classic rooms never display adaptive generation state and the final room returns to the menu', () => {
  const classic = {...base, round: null, nextRoom, directorError: 'Stale failure'};
  assert.equal(resultPrimaryAction(classic), 'next-level');
  assert.equal(resultViewModel(classic).nextRoom, null);
  assert.equal(resultViewModel(classic).status, null);
  assert.equal(resultPrimaryAction({...classic, finalClassic: true}), 'result-menu');
  assert.equal(resultViewModel({...classic, finalClassic: true}).title, 'All rooms escaped.');
  assert.equal(resultPrimaryAction({...classic, won: false, finalClassic: true}), 'retry');
});

test('loss explanations stay concise and runtime stacks never become result copy', () => {
  const lost = {...base, won: false};
  assert.equal(resultViewModel({...lost, reason: 'The floor collapsed.\nMore technical detail.'}).copy, 'The floor collapsed.');
  assert.ok(resultViewModel({...lost, reason: 'x'.repeat(500)}).copy.length <= 220);
  assert.doesNotMatch(resultViewModel({...lost, reason: 'ReferenceError: thing is not defined\n at step'}).copy, /ReferenceError|at step/);
});
