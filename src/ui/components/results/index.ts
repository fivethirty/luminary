import html from './results.html' with { type: 'text' };
import './results.css';
import { state, type SimulationResults } from '@ui/state';
import { battleUrl, copyToClipboard, formatChatReport } from '@ui/share';

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
        ? `Exact (deterministic) · ${results.timeTaken} ms`
        : `Monte Carlo · ${results.iterations.toLocaleString()} iterations · ${results.timeTaken} ms`;
    const tbody = this.querySelector('#results-tbody')!;
    const oddsStrip = this.querySelector('#odds-strip')!;
    tbody.innerHTML = '';
    oddsStrip.innerHTML = '';

    for (const [fleetName, percentage] of this.orderedByFleet(
      results.victoryProbability
    )) {
      if (percentage <= 0) continue;
      oddsStrip.appendChild(this.createOddsSegment(fleetName, percentage));
      tbody.appendChild(this.createResultRow(fleetName, percentage));
    }

    if (results.drawProbability > 0) {
      oddsStrip.appendChild(
        this.createOddsSegment('Draw', results.drawProbability, true)
      );
      tbody.appendChild(
        this.createResultRow('Draw', results.drawProbability, true)
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

  private createResultRow(
    fleetName: string,
    percentage: number,
    isDraw = false
  ): HTMLElement {
    const row = document.createElement('tr');
    row.className = isDraw ? 'result-row draw' : 'result-row';
    row.classList.add(...this.sideClasses(fleetName, isDraw));

    const nameCell = document.createElement('td');
    nameCell.className = 'fleet-name';
    nameCell.textContent = fleetName;

    const percentCell = document.createElement('td');
    percentCell.className = 'win-percentage';
    percentCell.textContent = `${(percentage * 100).toFixed(1)}%`;

    const barCell = document.createElement('td');
    barCell.className = 'win-bar-cell';

    const barDiv = document.createElement('div');
    barDiv.className = 'win-bar';

    const barFill = document.createElement('div');
    barFill.className = 'win-bar-fill';
    barFill.style.width = `${percentage * 100}%`;

    barDiv.appendChild(barFill);
    barCell.appendChild(barDiv);

    row.appendChild(nameCell);
    row.appendChild(percentCell);
    row.appendChild(barCell);

    return row;
  }

  private createOddsSegment(
    fleetName: string,
    percentage: number,
    isDraw = false
  ): HTMLElement {
    const segment = document.createElement('div');
    segment.className = `odds-segment ${this.sideClass(fleetName, isDraw)}`;
    segment.style.flexBasis = `${Math.max(percentage * 100, 2)}%`;

    const value = document.createElement('strong');
    value.textContent = `${Math.round(percentage * 100)}%`;

    const label = document.createElement('span');
    label.textContent = fleetName;

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
      .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return '—';
    return entries
      .map(([type, count]) => (count === 1 ? type : `${count} ${type}`))
      .join(', ');
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
