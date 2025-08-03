import html from './stat-cube.html' with { type: 'text' };
import './stat-cube.css';

export class StatCubeElement extends HTMLElement {
  private _value: number = 0;
  private _label = '';
  private input!: HTMLInputElement;

  get value(): number {
    return this._value;
  }

  set value(val: number) {
    this._value = val;
    if (this.input) {
      this.input.value = String(val);
    }
  }

  connectedCallback() {
    this.innerHTML = html as string;

    this.input = this.querySelector('input') as HTMLInputElement;
    const label = this.querySelector('label') as HTMLElement;

    this.input.value = String(this.value);
    label.textContent = this._label;

    this.addEventListener('click', () => {
      this.input.focus();
    });

    this.input.addEventListener('beforeinput', (e) => {
      if (e.data && !/^[0-9]+$/.test(e.data)) {
        e.preventDefault();
      }
    });

    this.input.addEventListener('input', () => {
      this.input.value = this.input.value.replace(/[^0-9]/g, '');

      if (this.input.value.length > 2) {
        this.input.value = this.input.value.slice(0, 2);
      }
    });

    this.input.addEventListener('change', () => {
      const newValue = parseInt(this.input.value) || 0;
      this.value = Math.max(0, Math.min(99, newValue));
      this.input.value = String(this.value);

      this.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  get label(): string {
    return this._label;
  }

  set label(val: string) {
    this._label = val;
    const labelEl = this.querySelector('label');
    if (labelEl) {
      labelEl.textContent = val;
    }
  }
}

customElements.define('calc-stat-cube', StatCubeElement);
