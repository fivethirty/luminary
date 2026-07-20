import html from './selector.html' with { type: 'text' };
import './selector.css';

export class SelectorElement extends HTMLElement {
  private valueDiv!: HTMLDivElement;
  private _value: number = 0;
  private _label = 'Ship quantity';
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
    this.innerHTML = html;

    this.valueDiv = this.querySelector('.selector > div')!;
    const buttons = this.querySelectorAll('button');
    const decrementBtn = buttons[0];
    const incrementBtn = buttons[1];
    this.applyAccessibleLabels();

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
    this.valueDiv.setAttribute(
      'aria-label',
      `${this.label}: ${this.value.toString()}`
    );
    if (this.decrementBtn && this.incrementBtn) {
      this.decrementBtn.disabled = this.value <= this.min;
      this.incrementBtn.disabled = this.value >= this.max;
    }
  }

  get label(): string {
    return this._label;
  }

  set label(val: string) {
    this._label = val;
    this.applyAccessibleLabels();
    if (this.valueDiv) this.render();
  }

  private applyAccessibleLabels() {
    const root = this.querySelector('.selector');
    root?.setAttribute('role', 'group');
    root?.setAttribute('aria-label', this.label);
    this.querySelector('.selector-dec')?.setAttribute(
      'aria-label',
      `Decrease ${this.label}`
    );
    this.querySelector('.selector-inc')?.setAttribute(
      'aria-label',
      `Increase ${this.label}`
    );
  }
}

customElements.define('calc-selector', SelectorElement);
