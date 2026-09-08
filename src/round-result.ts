export interface RoundResultInput {
  won: boolean;
  round: number | null;
  roomName: string;
  reason: string;
  roomFailure: boolean;
  nextRoom: { round: number; title: string; change: string; rule: string } | null;
  directorBusy: boolean;
  directorError: string;
  finalClassic: boolean;
}

export type ResultAction = 'next-level' | 'retry-director' | 'retry' | 'result-menu';

/** The keyboard and visible primary button share this decision. */
export function resultPrimaryAction(input: RoundResultInput): ResultAction | null {
  if (input.round === null) return input.won ? (input.finalClassic ? 'result-menu' : 'next-level') : 'retry';
  if (!input.won && !input.roomFailure) return 'retry';
  if (input.nextRoom) return 'next-level';
  if (input.directorError && !input.directorBusy) return 'retry-director';
  return null;
}

function conciseReason(reason: string): string {
  const firstLine = reason.split(/\r?\n/).find(line => line.trim())?.trim() || '';
  // Runtime errors have their own recovery state; never expose a stack trace as game copy.
  if (/^(?:Error|TypeError|ReferenceError|SyntaxError):|\bat (?:\w+\.|https?:\/\/)/.test(firstLine)) {
    return 'Something interrupted this attempt. Give it another try.';
  }
  return firstLine.length > 220 ? `${firstLine.slice(0, 217).trimEnd()}…` : firstLine;
}

export function resultViewModel(input: RoundResultInput) {
  const adaptive = input.round !== null;
  const repair = adaptive && input.roomFailure;
  const eligible = adaptive && (input.won || repair);
  const nextRoom = eligible ? input.nextRoom : null;
  const primary = resultPrimaryAction(input);
  const status = !eligible || nextRoom ? null : primary === 'retry-director' ? 'error' : 'waiting';
  const final = !adaptive && input.won && input.finalClassic;
  return {
    state: repair ? 'repair' : input.won ? 'won' : 'lost',
    tag: adaptive ? `Round ${input.round}` : input.roomName,
    title: repair ? 'The room hit a snag.' : final ? 'All rooms escaped.' : input.won ? 'You got out.' : 'Try another angle.',
    copy: repair ? (nextRoom ? 'A fresh version of the room is ready.' : 'This attempt ended because the room stopped working.') : final ? 'Three rooms. Three ways out. Nicely done.' : input.won ? 'You found a way through.' : conciseReason(input.reason) || 'A new approach might be all it takes.',
    primary,
    status,
    statusTitle: status === 'error' ? (repair ? 'The repair couldn’t finish.' : 'The next room couldn’t be prepared.') : repair ? 'Repairing the room…' : 'Preparing your next room…',
    statusCopy: status === 'error' ? 'Try preparing the room again to continue.' : 'You can continue as soon as it’s ready.',
    nextRoom,
    nextLabel: repair ? 'Ready to try again' : nextRoom ? `Up next · Round ${nextRoom.round}` : '',
    nextAction: adaptive ? (repair ? 'Enter repaired room' : `Enter round ${nextRoom?.round ?? ''}`) : 'Next room',
    retryAction: input.won ? (adaptive ? 'Replay round' : 'Replay room') : 'Retry round',
  };
}

export const resultMarkup = `
  <div class="result-box">
    <header class="result-header">
      <div class="micro" id="result-tag"></div>
      <h2 id="result-title"></h2>
      <p id="result-copy"></p>
    </header>
    <div id="result-status" class="result-status hidden" role="status" aria-live="polite" aria-atomic="true">
      <span class="result-status-dot" aria-hidden="true"></span>
      <div><strong id="result-status-title"></strong><p id="result-status-copy"></p></div>
    </div>
    <div id="counter-card" class="hidden" role="status" aria-live="polite" aria-atomic="true">
      <div class="result-next-label micro" id="counter-label"></div>
      <h3 id="counter-title"></h3>
      <p id="counter-change"></p>
      <p id="counter-rule" class="hidden"></p>
    </div>
    <div class="result-actions">
      <button id="next-level" class="hidden"><span class="result-action-label"></span><kbd>Enter</kbd></button>
      <button id="retry-director" class="hidden"><span class="result-action-label">Prepare room again</span><kbd>Enter</kbd></button>
    </div>
    <div class="result-secondary">
      <button id="retry"><span class="result-action-label">Retry round</span><kbd>R</kbd></button>
      <button id="result-menu"><span class="result-action-label">Menu</span><kbd>Esc</kbd></button>
    </div>
  </div>`;

/** Updates existing nodes so listeners, focus, and the live status survive generation updates. */
export function renderRoundResult(root: HTMLElement, input: RoundResultInput): void {
  const view = resultViewModel(input);
  const focused = root.contains(root.ownerDocument.activeElement) ? root.ownerDocument.activeElement as HTMLElement : null;
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const setText = (selector: string, text: string) => { get(selector).textContent = text; };
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'result-title');
  root.setAttribute('aria-describedby', 'result-copy');
  root.dataset.result = view.state;
  root.classList.toggle('won', input.won);
  setText('#result-tag', view.tag);
  setText('#result-title', view.title);
  setText('#result-copy', view.copy);
  const status = get('#result-status');
  status.classList.toggle('hidden', !view.status);
  status.dataset.state = view.status || '';
  setText('#result-status-title', view.statusTitle);
  setText('#result-status-copy', view.statusCopy);
  const card = get('#counter-card');
  card.classList.toggle('hidden', !view.nextRoom);
  setText('#counter-label', view.nextLabel);
  setText('#counter-title', view.nextRoom?.title || '');
  setText('#counter-change', view.nextRoom?.change || '');
  setText('#counter-rule', view.nextRoom?.rule || '');
  get('#counter-rule').classList.toggle('hidden', !view.nextRoom?.rule);
  const primary = get('.result-actions');
  const secondary = get('.result-secondary');
  const labels: Record<ResultAction, string> = {
    'next-level': view.nextAction,
    'retry-director': 'Prepare room again',
    retry: view.primary === 'retry' ? 'Try again' : view.retryAction,
    'result-menu': view.primary === 'result-menu' ? 'Back to menu' : 'Menu',
  };
  for (const id of ['next-level', 'retry-director', 'retry', 'result-menu'] as const) {
    const button = get<HTMLButtonElement>(`#${id}`);
    const isPrimary = view.primary === id;
    const shown = isPrimary || id === 'retry' || id === 'result-menu';
    button.classList.toggle('hidden', !shown);
    button.classList.toggle('result-primary', isPrimary);
    button.classList.toggle('result-secondary-action', !isPrimary);
    button.disabled = !shown;
    button.querySelector('.result-action-label')!.textContent = labels[id];
    button.querySelector('kbd')!.textContent = isPrimary ? 'Enter' : id === 'retry' ? 'R' : 'Esc';
    // Avoid moving a focused button unless its action actually changed groups.
    const group = isPrimary ? primary : secondary;
    if (button.parentElement !== group) {
      if (id === 'retry' && group === secondary) group.prepend(button);
      else group.append(button);
    }
  }
  primary.classList.toggle('hidden', !view.primary);
  if (focused?.closest('button.hidden')) {
    root.tabIndex = -1;
    root.focus({preventScroll: true});
  } else if (focused && root.ownerDocument.activeElement !== focused) {
    focused.focus({preventScroll: true});
  }
}
