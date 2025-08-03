import html from './results.html' with { type: 'text' };
import './results.css';
import { state } from '@ui/state';

export class ResultsElement extends HTMLElement {
  private resultItemTemplate!: HTMLTemplateElement;
  private fleetSurvivorsTemplate!: HTMLTemplateElement;
  private shipSurvivorTemplate!: HTMLTemplateElement;

  connectedCallback() {
    this.innerHTML = html as string;

    this.resultItemTemplate = this.querySelector('#result-item-template')!;
    this.fleetSurvivorsTemplate = this.querySelector(
      '#fleet-survivors-template'
    )!;
    this.shipSurvivorTemplate = this.querySelector('#ship-survivor-template')!;

    this.render();
  }

  render() {
    this.renderWinPercentages();
    this.renderSurvivors();

    setTimeout(() => {
      this.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 100);
  }

  private renderWinPercentages() {
    const results = state.simulationResults!;
    const winGrid = this.querySelector('#win-percentage-grid')!;
    winGrid.innerHTML = '';

    const sortedFleets = Object.entries(results.victoryProbability).sort(
      ([, a], [, b]) => b - a
    );

    for (const [fleetName, percentage] of sortedFleets) {
      winGrid.appendChild(this.createResultItem(fleetName, percentage));
    }

    if (results.drawProbability > 0) {
      winGrid.appendChild(
        this.createResultItem('Draw', results.drawProbability, true)
      );
    }
  }

  private createResultItem(
    name: string,
    percentage: number,
    isDraw = false
  ): HTMLElement {
    const clone = this.resultItemTemplate.content.cloneNode(
      true
    ) as DocumentFragment;
    const resultItem = clone.querySelector('.result-item')!;

    if (isDraw) {
      resultItem.classList.add('draw');
    }

    const nameEl = clone.querySelector('.result-name')!;
    const percentEl = clone.querySelector('.result-percentage')!;
    const fillEl = clone.querySelector('.result-bar-fill') as HTMLElement;

    nameEl.textContent = name;
    percentEl.textContent = `${(percentage * 100).toFixed(1)}%`;
    fillEl.style.width = `${percentage * 100}%`;

    if (isDraw) {
      fillEl.classList.add('draw-fill');
    }

    return clone as unknown as HTMLElement;
  }

  private renderSurvivors() {
    const results = state.simulationResults!;
    const survivorsGrid = this.querySelector('#survivors-grid')!;
    const survivorsSection = this.querySelector(
      '#survivors-section'
    ) as HTMLElement;

    survivorsGrid.innerHTML = '';
    let hasSurvivors = false;

    for (const [fleetName, survivors] of Object.entries(
      results.expectedSurvivors
    )) {
      const survivorEntries = Object.entries(survivors).filter(
        ([, count]) => count > 0
      );

      if (survivorEntries.length > 0) {
        hasSurvivors = true;
        survivorsGrid.appendChild(
          this.createFleetSurvivors(fleetName, survivorEntries)
        );
      }
    }

    survivorsSection.style.display = hasSurvivors ? 'block' : 'none';
  }

  private createFleetSurvivors(
    fleetName: string,
    survivors: [string, number][]
  ): HTMLElement {
    const clone = this.fleetSurvivorsTemplate.content.cloneNode(
      true
    ) as DocumentFragment;

    const headerEl = clone.querySelector('.fleet-survivors-header')!;
    const shipListEl = clone.querySelector('.ship-survivors-list')!;

    headerEl.textContent = fleetName;

    for (const [shipType, count] of survivors) {
      shipListEl.appendChild(this.createShipSurvivor(shipType, count));
    }

    return clone as unknown as HTMLElement;
  }

  private createShipSurvivor(shipType: string, count: number): HTMLElement {
    const clone = this.shipSurvivorTemplate.content.cloneNode(
      true
    ) as DocumentFragment;

    const typeEl = clone.querySelector('.ship-type')!;
    const countEl = clone.querySelector('.ship-count')!;

    typeEl.textContent = shipType;
    countEl.textContent = count.toFixed(1);

    return clone as unknown as HTMLElement;
  }
}

customElements.define('calc-results', ResultsElement);
