import html from './selector.html' with { type: 'text' };
import './selector.css';

export class SelectorElement extends HTMLElement {
  private valueDiv!: HTMLDivElement;
  private _value: number = 0;
  min: number = 0;
  max: number = 10;

  get value(): number {
    return this._value;
  }

  set value(val: number) {
    this._value = val;
    if (this.valueDiv) {
      this.render();
    }
  }

  connectedCallback() {
    this.innerHTML = html as string;

    this.valueDiv = this.querySelector('.selector > div')!;
    const buttons = this.querySelectorAll('button');
    const decrementBtn = buttons[0];
    const incrementBtn = buttons[1];

    decrementBtn.addEventListener('click', () => {
      const newValue = Math.max(this.min, this.value - 1);
      if (newValue !== this.value) {
        this.value = newValue;

        this.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    incrementBtn.addEventListener('click', () => {
      const newValue = Math.min(this.max, this.value + 1);
      if (newValue !== this.value) {
        this.value = newValue;

        this.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    this.decrementBtn = decrementBtn;
    this.incrementBtn = incrementBtn;

    this.render();
  }

  private decrementBtn?: HTMLButtonElement;
  private incrementBtn?: HTMLButtonElement;

  render() {
    this.valueDiv.textContent = this.value.toString();
    if (this.decrementBtn && this.incrementBtn) {
      this.decrementBtn.disabled = this.value <= this.min;
      this.incrementBtn.disabled = this.value >= this.max;
    }
  }
}

customElements.define('calc-selector', SelectorElement);
