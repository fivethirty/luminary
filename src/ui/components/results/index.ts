import html from './results.html' with { type: 'text' };
import './results.css';
import { state, type SimulationResults } from '@ui/state';
import { battleUrl, copyToClipboard, formatChatReport } from '@ui/share';
import { fleetColor } from '@ui/fleet-metadata';
import { resultClassesForFleet } from '@ui/result-presentation';
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

    this.renderWinPercentages(results);
    this.renderSurvivorDistribution(results);
    this.renderSurvivors(results);
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
        ? `${results.methodLabel} · deterministic · ${results.timeTaken} ms`
        : `${results.methodLabel} · ${results.iterations.toLocaleString()} iterations · ${results.timeTaken} ms`;
    const oddsStrip = this.querySelector('#odds-strip')!;
    const resultsBars = this.querySelector('#results-bars')!;
    oddsStrip.innerHTML = '';
    resultsBars.innerHTML = '';

    for (const [fleetKey, percentage] of this.orderedByFleet(
      results.victoryProbability
    )) {
      if (percentage <= 0) continue;
      oddsStrip.appendChild(this.createOddsSegment(fleetKey, percentage));
      resultsBars.appendChild(this.createResultBar(fleetKey, percentage));
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

    for (const [fleetKey, survivors] of this.orderedByFleet(
      results.expectedSurvivors
    )) {
      const survivorEntries = Object.entries(
        survivors as Record<string, number>
      ).filter(([, count]) => count > 0);

      if (survivorEntries.length > 0) {
        hasSurvivors = true;
        grid.appendChild(this.createSurvivorCard(fleetKey, survivorEntries));
      }
    }

    survivorsSection.style.display = hasSurvivors ? 'block' : 'none';
  }

  // Orders entries by the fleets' on-screen order (defender is fleet 0, so it
  // always lists first), regardless of the order the result producer used.
  // Keys not found in the fleet list keep their insertion order at the end.
  private orderedByFleet<T>(byFleet: Record<string, T>): [string, T][] {
    return Object.entries(byFleet)
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const positionDelta =
          this.fleetIndex(a.entry[0]) - this.fleetIndex(b.entry[0]);
        return positionDelta || a.index - b.index;
      })
      .map(({ entry }) => entry);
  }

  private createResultBar(
    fleetKey: string,
    percentage: number,
    isDraw = false
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = isDraw ? 'result-bar-row draw' : 'result-bar-row';
    row.classList.add(...this.sideClasses(fleetKey, isDraw));
    this.applyFleetResultColor(row, fleetKey, isDraw);

    const label = document.createElement('div');
    label.className = 'result-bar-label';

    const name = document.createElement('span');
    name.textContent = this.fleetLabel(fleetKey, isDraw);

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
    fleetKey: string,
    percentage: number,
    isDraw = false
  ): HTMLElement {
    const segment = document.createElement('div');
    segment.className = `odds-segment ${this.sideClass(fleetKey, isDraw)}`;
    this.applyFleetResultColor(segment, fleetKey, isDraw);
    if (percentage < ODDS_SLIVER_THRESHOLD) {
      segment.classList.add('odds-segment--sliver');
    } else if (percentage < ODDS_PERCENT_ONLY_THRESHOLD) {
      segment.classList.add('odds-segment--percent-only');
    }
    segment.style.flexBasis = `${Math.max(
      percentage * 100,
      ODDS_MINIMUM_BASIS_PERCENT
    )}%`;

    const fleetLabel = this.fleetLabel(fleetKey, isDraw);
    const percentText = `${Math.round(percentage * 100)}%`;
    const fullLabel = `${fleetLabel}: ${(percentage * 100).toFixed(1)}%`;
    segment.setAttribute('aria-label', fullLabel);
    segment.title = fullLabel;

    const value = document.createElement('strong');
    value.textContent = percentText;
    value.hidden = percentage < ODDS_SLIVER_THRESHOLD;

    const label = document.createElement('span');
    label.textContent = fleetLabel;
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
    const defender = state.fleets[0];
    const defenderKey = defender?.id ?? 'Defender';
    const defenderText = this.formatFleetComposition(
      defender ? this.resultForFleet(survivors, defender) : undefined
    );
    const attackerCompositions = state.fleets
      .slice(1)
      .map((fleet) => ({
        key: fleet.id,
        text: this.formatFleetComposition(
          this.resultForFleet(survivors, fleet)
        ),
      }))
      .filter((entry) => entry.text !== '—');

    if (defenderText !== '—') row.classList.add('defender-result');
    if (defenderText !== '—') this.applyFleetResultColor(row, defenderKey);
    if (attackerCompositions.length === 1) {
      row.classList.add(...this.sideClasses(attackerCompositions[0].key));
      this.applyFleetResultColor(row, attackerCompositions[0].key);
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
        label.classList.add(...this.sideClasses(entry.key));
        this.applyFleetResultColor(label, entry.key);
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
    fleetKey: string,
    survivors: [string, number][]
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'survivor-fleet-card';
    card.classList.add(...this.sideClasses(fleetKey));
    this.applyFleetResultColor(card, fleetKey);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'survivor-fleet-name';
    nameDiv.textContent = this.fleetLabel(fleetKey);

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

  private sideClass(fleetKey: string, isDraw = false): string {
    return this.sideClasses(fleetKey, isDraw).join(' ');
  }

  private sideClasses(fleetKey: string, isDraw = false): string[] {
    const fleetIndex = this.fleetIndex(fleetKey);
    return resultClassesForFleet(
      fleetIndex === Number.MAX_SAFE_INTEGER ? null : fleetIndex,
      isDraw || fleetKey === 'Draw'
    );
  }

  private applyFleetResultColor(
    element: HTMLElement,
    fleetKey: string,
    isDraw = false
  ) {
    if (isDraw || fleetKey === 'Draw') {
      element.style.removeProperty('--fleet-result');
      element.style.removeProperty('--fleet-result-soft');
      return;
    }

    const fleetIndex = this.fleetIndex(fleetKey);
    if (fleetIndex === Number.MAX_SAFE_INTEGER) return;
    const color = fleetColor(state.fleets[fleetIndex].colorId, fleetIndex);
    element.style.setProperty('--fleet-result', color.color);
    element.style.setProperty('--fleet-result-soft', color.soft);
  }

  private fleetIndex(fleetKey: string): number {
    const byId = state.fleets.findIndex((fleet) => fleet.id === fleetKey);
    if (byId !== -1) return byId;

    // Accept legacy/name-keyed fixtures at the presentation boundary. New
    // application results always use IDs, so duplicate labels remain safe.
    const byLegacyName = state.fleets.findIndex(
      (fleet) => fleet.name === fleetKey
    );
    return byLegacyName === -1 ? Number.MAX_SAFE_INTEGER : byLegacyName;
  }

  private fleetLabel(fleetKey: string, isDraw = false): string {
    if (isDraw || fleetKey === 'Draw') return 'Draw';
    const index = this.fleetIndex(fleetKey);
    return index === Number.MAX_SAFE_INTEGER
      ? fleetKey
      : state.fleets[index].name;
  }

  private resultForFleet<T>(
    byFleet: Record<string, T>,
    fleet: (typeof state.fleets)[number]
  ): T | undefined {
    return byFleet[fleet.id] ?? byFleet[fleet.name];
  }
}

customElements.define('calc-results', ResultsElement);
