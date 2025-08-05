import html from './results.html' with { type: 'text' };
import './results.css';
import { state } from '@ui/state';

export class ResultsElement extends HTMLElement {
  private resultRowTemplate!: HTMLTemplateElement;
  private survivorFleetTemplate!: HTMLTemplateElement;

  connectedCallback() {
    this.innerHTML = html as string;
    this.resultRowTemplate = this.querySelector('#result-row-template')!;
    this.survivorFleetTemplate = this.querySelector('#survivor-fleet-template')!;
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

  private renderWinPercentages(results: any) {
    const tbody = this.querySelector('#results-tbody')!;
    tbody.innerHTML = '';

    // Show fleets in their original order
    for (const [fleetName, percentage] of Object.entries(results.victoryProbability)) {
      tbody.appendChild(this.createResultRow(fleetName, percentage));
    }

    if (results.drawProbability > 0) {
      tbody.appendChild(this.createResultRow('Draw', results.drawProbability, true));
    }
  }

  private renderSurvivors(results: any) {
    const survivorsSection = this.querySelector('#survivors-section') as HTMLElement;
    const grid = this.querySelector('#survivors-grid')!;
    grid.innerHTML = '';

    let hasSurvivors = false;
    
    // Show fleets in their original order
    for (const [fleetName, survivors] of Object.entries(results.expectedSurvivors)) {
      const survivorEntries = Object.entries(survivors as Record<string, number>)
        .filter(([, count]) => count > 0);
      
      if (survivorEntries.length > 0) {
        hasSurvivors = true;
        grid.appendChild(this.createSurvivorCard(fleetName, survivorEntries));
      }
    }

    survivorsSection.style.display = hasSurvivors ? 'block' : 'none';
  }

  private createResultRow(fleetName: string, percentage: number, isDraw = false): HTMLElement {
    const clone = this.resultRowTemplate.content.cloneNode(true) as DocumentFragment;
    
    if (isDraw) {
      const row = clone.querySelector('.result-row')!;
      row.classList.add('draw');
    }
    
    const nameEl = clone.querySelector('.fleet-name')!;
    const percentEl = clone.querySelector('.win-percentage')!;
    const barFill = clone.querySelector('.win-bar-fill') as HTMLElement;

    nameEl.textContent = fleetName;
    percentEl.textContent = `${(percentage * 100).toFixed(1)}%`;
    barFill.style.width = `${percentage * 100}%`;

    return clone as unknown as HTMLElement;
  }

  private createSurvivorCard(fleetName: string, survivors: [string, number][]): HTMLElement {
    const clone = this.survivorFleetTemplate.content.cloneNode(true) as DocumentFragment;
    
    const nameEl = clone.querySelector('.survivor-fleet-name')!;
    const tbody = clone.querySelector('.survivor-ships-tbody')!;

    nameEl.textContent = fleetName;
    
    const rows = survivors.map(([type, count]) => {
      const countStr = count % 1 === 0 ? count.toString() : count.toFixed(1);
      return `<tr><td>${type}</td><td>${countStr}</td></tr>`;
    }).join('');
    
    tbody.innerHTML = rows;

    return clone as unknown as HTMLElement;
  }
}

customElements.define('calc-results', ResultsElement);
