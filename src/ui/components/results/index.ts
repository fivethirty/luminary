import html from './results.html' with { type: 'text' };
import './results.css';
import { state, type SimulationResults } from '@ui/state';

export class ResultsElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = html;
    this.render();
  }

  render() {
    const results = state.simulationResults!;

    this.renderWinPercentages(results);
    this.renderSurvivors(results);

    setTimeout(() => {
      this.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 100);
  }

  private renderWinPercentages(results: SimulationResults) {
    const resultsTime = this.querySelector('.results-time')!;
    resultsTime.textContent =
      results.method === 'exact'
        ? `Exact (deterministic) · ${results.timeTaken} ms`
        : `Monte Carlo · ${results.iterations.toLocaleString()} iterations · ${results.timeTaken} ms`;
    const tbody = this.querySelector('#results-tbody')!;
    tbody.innerHTML = '';

    for (const [fleetName, percentage] of this.orderedByFleet(
      results.victoryProbability
    )) {
      tbody.appendChild(this.createResultRow(fleetName, percentage));
    }

    if (results.drawProbability > 0) {
      tbody.appendChild(
        this.createResultRow('Draw', results.drawProbability, true)
      );
    }
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

  private createSurvivorCard(
    fleetName: string,
    survivors: [string, number][]
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'survivor-fleet-card';

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
}

customElements.define('calc-results', ResultsElement);
