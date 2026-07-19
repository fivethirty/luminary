import html from './results.html' with { type: 'text' };
import './results.css';
import { state, type SimulationResults } from '@ui/state';
import { battleUrl, copyToClipboard, formatChatReport } from '@ui/share';
import { computeVerdict } from '@ui/verdict';
import { SHIP_ABBREVIATIONS, SHIP_NAMES } from '@ui/ship-presets';

const SHIP_NAME_ABBREVIATIONS = Object.fromEntries(
  Object.entries(SHIP_NAMES).map(([key, name]) => [
    name,
    SHIP_ABBREVIATIONS[key as keyof typeof SHIP_ABBREVIATIONS],
  ])
) as Record<string, string>;

const PLAYER_COMPOSITION_ORDER = new Map(
  ['Dreadnought', 'Cruiser', 'Interceptor', 'Orbital', 'Starbase'].map(
    (name, index) => [name, index]
  )
);

const ODDS_PERCENT_ONLY_THRESHOLD = 0.2;
const ODDS_SLIVER_THRESHOLD = 0.035;
const ODDS_MINIMUM_BASIS_PERCENT = 0.75;

export class ResultsElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = html;
    this.bindShareActions();
    this.render();
  }

  // No scrolling here: results re-render on every auto-simulate, and yanking
  // the viewport mid-edit would fight the user. The mobile live bar (and the
  // fact that desktop shows results in place) covers discovery.
  render() {
    const results = state.simulationResults!;

    this.renderVerdict(results);
    this.renderWinPercentages(results);
    this.renderSurvivorDistribution(results);
    this.renderSurvivors(results);
  }

  // The lead of the report: a plain-language sentence a player would say out
  // loud ("Attacker favored — 73%") plus a margin-calibrated tag, so the
  // answer reads at a glance before the tables.
  private renderVerdict(results: SimulationResults) {
    const verdict = computeVerdict(results, state.fleets);

    const headline = this.querySelector('.verdict-headline') as HTMLElement;
    headline.textContent = verdict.headline;
    headline.className = `verdict-headline ${verdict.className}`;

    const tag = this.querySelector('.verdict-tag') as HTMLElement;
    tag.textContent = verdict.tag;
    tag.hidden = false;
  }

  private bindShareActions() {
    const linkBtn = this.querySelector('.copy-link-btn') as HTMLButtonElement;
    const chatBtn = this.querySelector('.copy-chat-btn') as HTMLButtonElement;

    linkBtn.addEventListener('click', async () => {
      const copied = await copyToClipboard(battleUrl(state.fleets));
      this.flashCopyFeedback(linkBtn, copied);
    });

    chatBtn.addEventListener('click', async () => {
      const report = formatChatReport(
        state.fleets,
        state.simulationResults!,
        battleUrl(state.fleets)
      );
      const copied = await copyToClipboard(report);
      this.flashCopyFeedback(chatBtn, copied);
    });
  }

  private flashCopyFeedback(button: HTMLButtonElement, copied: boolean) {
    const label = button.textContent;
    button.textContent = copied ? 'Copied ✓' : 'Copy failed';
    button.disabled = true;
    setTimeout(() => {
      button.textContent = label;
      button.disabled = false;
    }, 1500);
  }

  private renderWinPercentages(results: SimulationResults) {
    const resultsTime = this.querySelector('.results-time')!;
    resultsTime.textContent =
      results.method === 'exact'
        ? `Exact (deterministic) · ${results.timeTaken} ms`
        : `Monte Carlo · ${results.iterations.toLocaleString()} iterations · ${results.timeTaken} ms`;
    const oddsStrip = this.querySelector('#odds-strip')!;
    const resultsBars = this.querySelector('#results-bars')!;
    oddsStrip.innerHTML = '';
    resultsBars.innerHTML = '';

    for (const [fleetName, percentage] of this.orderedByFleet(
      results.victoryProbability
    )) {
      if (percentage <= 0) continue;
      oddsStrip.appendChild(this.createOddsSegment(fleetName, percentage));
      resultsBars.appendChild(this.createResultBar(fleetName, percentage));
    }

    if (results.drawProbability > 0) {
      oddsStrip.appendChild(
        this.createOddsSegment('Draw', results.drawProbability, true)
      );
      resultsBars.appendChild(
        this.createResultBar('Draw', results.drawProbability, true)
      );
    }
  }

  private renderSurvivorDistribution(results: SimulationResults) {
    const section = this.querySelector(
      '#survivor-distribution-section'
    ) as HTMLElement;
    const tbody = this.querySelector('#survivor-distribution-tbody')!;
    tbody.innerHTML = '';

    const entries = results.survivorDistribution.filter(
      (entry) => entry.probability > 0
    );
    if (entries.length === 0) {
      section.style.display = 'none';
      return;
    }

    const visibleEntries = entries.slice(0, 8);
    for (const entry of visibleEntries) {
      tbody.appendChild(
        this.createCompositionRow(entry.probability, entry.survivors)
      );
    }

    if (entries.length > visibleEntries.length) {
      const remainingProbability = entries
        .slice(visibleEntries.length)
        .reduce((sum, entry) => sum + entry.probability, 0);
      tbody.appendChild(this.createOtherCompositionRow(remainingProbability));
    }

    section.style.display = 'block';
  }

  private renderSurvivors(results: SimulationResults) {
    const survivorsSection = this.querySelector(
      '#survivors-section'
    ) as HTMLElement;
    const grid = this.querySelector('#survivors-grid')!;
    grid.innerHTML = '';

    let hasSurvivors = false;

    for (const [fleetName, survivors] of Object.entries(
      results.expectedSurvivors
    )) {
      const survivorEntries = Object.entries(
        survivors as Record<string, number>
      ).filter(([, count]) => count > 0);

      if (survivorEntries.length > 0) {
        hasSurvivors = true;
        grid.appendChild(this.createSurvivorCard(fleetName, survivorEntries));
      }
    }

    survivorsSection.style.display = hasSurvivors ? 'block' : 'none';
  }

  // Orders entries by the fleets' on-screen order (defender is fleet 0, so it
  // always lists first), regardless of the order the result producer used.
  // Names not found in the fleet list keep their insertion order at the end.
  private orderedByFleet(byName: Record<string, number>): [string, number][] {
    const fleetOrder = state.fleets.map((fleet) => fleet.name);
    const position = (name: string): number => {
      const idx = fleetOrder.indexOf(name);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    return Object.entries(byName)
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const positionDelta = position(a.entry[0]) - position(b.entry[0]);
        return positionDelta || a.index - b.index;
      })
      .map(({ entry }) => entry);
  }

  private createResultBar(
    fleetName: string,
    percentage: number,
    isDraw = false
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = isDraw ? 'result-bar-row draw' : 'result-bar-row';
    row.classList.add(...this.sideClasses(fleetName, isDraw));

    const label = document.createElement('div');
    label.className = 'result-bar-label';

    const name = document.createElement('span');
    name.textContent = fleetName;

    const value = document.createElement('strong');
    value.textContent = `${(percentage * 100).toFixed(1)}%`;

    label.appendChild(name);
    label.appendChild(value);

    const track = document.createElement('div');
    track.className = 'result-bar-track';

    const fill = document.createElement('div');
    fill.className = 'result-bar-fill';
    fill.style.width = `${percentage * 100}%`;

    track.appendChild(fill);
    row.appendChild(label);
    row.appendChild(track);

    return row;
  }

  private createOddsSegment(
    fleetName: string,
    percentage: number,
    isDraw = false
  ): HTMLElement {
    const segment = document.createElement('div');
    segment.className = `odds-segment ${this.sideClass(fleetName, isDraw)}`;
    if (percentage < ODDS_SLIVER_THRESHOLD) {
      segment.classList.add('odds-segment--sliver');
    } else if (percentage < ODDS_PERCENT_ONLY_THRESHOLD) {
      segment.classList.add('odds-segment--percent-only');
    }
    segment.style.flexBasis = `${Math.max(
      percentage * 100,
      ODDS_MINIMUM_BASIS_PERCENT
    )}%`;

    const percentText = `${Math.round(percentage * 100)}%`;
    const fullLabel = `${fleetName}: ${(percentage * 100).toFixed(1)}%`;
    segment.setAttribute('aria-label', fullLabel);
    segment.title = fullLabel;

    const value = document.createElement('strong');
    value.textContent = percentText;
    value.hidden = percentage < ODDS_SLIVER_THRESHOLD;

    const label = document.createElement('span');
    label.textContent = fleetName;
    label.hidden = percentage < ODDS_PERCENT_ONLY_THRESHOLD;

    segment.appendChild(value);
    segment.appendChild(label);
    return segment;
  }

  private createCompositionRow(
    probability: number,
    survivors: Record<string, Record<string, number>>
  ): HTMLElement {
    const row = document.createElement('tr');
    const defenderName = state.fleets[0]?.name ?? 'Defender';
    const attackerNames = state.fleets.slice(1).map((fleet) => fleet.name);
    const defenderText = this.formatFleetComposition(survivors[defenderName]);
    const attackerCompositions = attackerNames
      .map((name) => ({
        name,
        text: this.formatFleetComposition(survivors[name]),
      }))
      .filter((entry) => entry.text !== '—');

    if (defenderText !== '—') row.classList.add('defender-result');
    if (attackerCompositions.length === 1) {
      row.classList.add(...this.sideClasses(attackerCompositions[0].name));
    } else if (attackerCompositions.length > 1) {
      row.classList.add('attacker-result');
    }

    const defenderCell = document.createElement('td');
    defenderCell.textContent = defenderText;

    const probabilityCell = document.createElement('td');
    probabilityCell.className = 'composition-probability';
    probabilityCell.textContent = this.formatPercent(probability);

    const attackerCell = document.createElement('td');
    if (attackerCompositions.length === 0) {
      attackerCell.textContent = '—';
    } else {
      attackerCompositions.forEach((entry, index) => {
        if (index > 0) {
          attackerCell.appendChild(document.createTextNode(' / '));
        }
        const label = document.createElement('span');
        label.classList.add(...this.sideClasses(entry.name));
        label.textContent = entry.text;
        attackerCell.appendChild(label);
      });
    }

    row.appendChild(defenderCell);
    row.appendChild(probabilityCell);
    row.appendChild(attackerCell);
    return row;
  }

  private createOtherCompositionRow(probability: number): HTMLElement {
    const row = document.createElement('tr');
    row.className = 'composition-other';

    const labelCell = document.createElement('td');
    labelCell.textContent = 'Other outcomes';

    const probabilityCell = document.createElement('td');
    probabilityCell.className = 'composition-probability';
    probabilityCell.textContent = this.formatPercent(probability);

    const emptyCell = document.createElement('td');
    emptyCell.textContent = '—';

    row.appendChild(labelCell);
    row.appendChild(probabilityCell);
    row.appendChild(emptyCell);
    return row;
  }

  private createSurvivorCard(
    fleetName: string,
    survivors: [string, number][]
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'survivor-fleet-card';
    card.classList.add(...this.sideClasses(fleetName));

    const nameDiv = document.createElement('div');
    nameDiv.className = 'survivor-fleet-name';
    nameDiv.textContent = fleetName;

    const table = document.createElement('table');
    table.className = 'survivor-ships-table';

    const tbody = document.createElement('tbody');
    tbody.className = 'survivor-ships-tbody';

    survivors.forEach(([type, count]) => {
      const row = document.createElement('tr');

      const typeCell = document.createElement('td');
      typeCell.textContent = type;

      const countCell = document.createElement('td');
      const countStr = count % 1 === 0 ? count.toString() : count.toFixed(1);
      countCell.textContent = countStr;

      row.appendChild(typeCell);
      row.appendChild(countCell);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    card.appendChild(nameDiv);
    card.appendChild(table);

    return card;
  }

  private formatFleetComposition(
    survivors: Record<string, number> | undefined
  ): string {
    if (!survivors) return '—';
    const entries = Object.entries(survivors)
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => {
        const orderDelta =
          this.compositionShipOrder(a) - this.compositionShipOrder(b);
        return orderDelta || a.localeCompare(b);
      });
    if (entries.length === 0) return '—';
    return entries
      .map(([type, count]) => {
        const label = SHIP_NAME_ABBREVIATIONS[type] ?? type;
        return count === 1 ? label : `${count} ${label}`;
      })
      .join(', ');
  }

  private compositionShipOrder(type: string): number {
    return PLAYER_COMPOSITION_ORDER.get(type) ?? Number.MAX_SAFE_INTEGER;
  }

  private formatPercent(value: number): string {
    return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
  }

  private sideClass(fleetName: string, isDraw = false): string {
    return this.sideClasses(fleetName, isDraw).join(' ');
  }

  private sideClasses(fleetName: string, isDraw = false): string[] {
    if (isDraw || fleetName === 'Draw') return ['draw-result'];
    const fleetIndex = state.fleets.findIndex(
      (fleet) => fleet.name === fleetName
    );
    if (fleetIndex === 0) return ['defender-result'];
    if (fleetIndex > 1) {
      return ['attacker-result', `attacker-result-${Math.min(fleetIndex, 4)}`];
    }
    return ['attacker-result'];
  }
}

customElements.define('calc-results', ResultsElement);
