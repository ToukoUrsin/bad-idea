import '../src/style.css';
import '../src/menus.css';
import {renderRoundResult, resultMarkup, resultPrimaryAction, type RoundResultInput} from '../src/round-result';

const nextRoom = {round: 3, title: 'A higher bar', change: 'The exit is above you now. Find a way to rise without waking the floor.', rule: 'This round: wood and rope only.'};
const base: RoundResultInput = {won: true, round: 2, roomName: 'The crossing', reason: '', roomFailure: false, nextRoom: null, directorBusy: false, directorError: '', finalClassic: false};
const scenarios: Record<string, RoundResultInput> = {
  'Round complete · ready': {...base, nextRoom},
  'Round complete · preparing': {...base, directorBusy: true},
  'Round complete · error': {...base, directorError: 'Network request failed'},
  'Round lost': {...base, won: false, reason: 'You fell into the gap.'},
  'Room repair · preparing': {...base, won: false, roomFailure: true, directorBusy: true},
  'Room repair · error': {...base, won: false, roomFailure: true, directorError: 'Network request failed'},
  'Room repair · ready': {...base, won: false, roomFailure: true, nextRoom: {...nextRoom, round: 2}},
  'Classic room complete': {...base, round: null},
  'Classic run complete': {...base, round: null, finalClassic: true},
};
const root = document.querySelector<HTMLElement>('#result')!;
const select = document.querySelector<HTMLSelectElement>('#scenario')!;
const output = document.querySelector<HTMLOutputElement>('#preview-action')!;
root.innerHTML = resultMarkup;
for (const name of Object.keys(scenarios)) select.add(new Option(name, name));
const render = () => { output.textContent = ''; renderRoundResult(root, scenarios[select.value]); };
select.addEventListener('change', render);
root.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (button) output.textContent = `Action: ${button.id}`;
});
window.addEventListener('keydown', event => {
  if ((event.target as HTMLElement).tagName === 'SELECT') return;
  const id = event.key === 'Enter' ? resultPrimaryAction(scenarios[select.value]) : event.key === 'Escape' ? 'result-menu' : event.key.toLowerCase() === 'r' ? 'retry' : null;
  if (id) { event.preventDefault(); root.querySelector<HTMLButtonElement>(`#${id}`)?.click(); }
});
render();
