import html from './stat-cube.html' with { type: 'text' };
import './stat-cube.css';

export class StatCubeElement extends HTMLElement {
  private _value: number = 0;
  private _label = '';
  private _disabled = false;
  private input!: HTMLInputElement;
  private originalValue = '';

  static get observedAttributes() {
    return ['disabled'];
  }

  get value(): number {
    return this._value;
  }

  set value(val: number) {
    this._value = val;
    if (this.input) {
      this.input.value = String(val);
    }
  }

  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(val: boolean) {
    this._disabled = val;
    this.toggleAttribute('disabled', val);
    this.applyDisabledState();
  }

  attributeChangedCallback(name: string) {
    if (name === 'disabled') {
      this._disabled = this.hasAttribute('disabled');
      this.applyDisabledState();
    }
  }

  connectedCallback() {
    this.innerHTML = html;

    this.input = this.querySelector('input') as HTMLInputElement;
    const label = this.querySelector('label') as HTMLElement;

    this.input.value = String(this.value);
    label.textContent = this._label;
    this.applyDisabledState();

    this.addEventListener('click', (e) => {
      if (this.disabled) return;
      // Clicks on the stepper buttons adjust the value; anywhere else on the
      // cube focuses the input for direct typing.
      if ((e.target as HTMLElement).closest('.stat-step')) return;
      this.input.focus();
    });

    this.bindStepper('.stat-dec', -1);
    this.bindStepper('.stat-inc', 1);

    this.input.addEventListener('focus', () => {
      this.originalValue = this.input.value;
      this.input.value = '';
    });

    this.input.addEventListener('blur', () => {
      if (this.input.value === '') {
        this.input.value = this.originalValue;
      }
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
      if (this.disabled) {
        this.input.value = String(this.value);
        return;
      }
      const newValue = parseInt(this.input.value) || 0;
      this.value = Math.max(0, Math.min(99, newValue));
      this.input.value = String(this.value);

      this.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  private step(delta: number) {
    if (this.disabled) return;
    this.value = Math.max(0, Math.min(99, this.value + delta));
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private applyDisabledState() {
    if (!this.input) return;
    this.input.disabled = this.disabled;
    this.querySelectorAll('.stat-step').forEach((button) => {
      (button as HTMLButtonElement).disabled = this.disabled;
    });
  }

  // Tap steps once; press-and-hold repeats. The repeat suppresses the click
  // that fires on release so a hold doesn't add an extra step.
  private bindStepper(selector: string, delta: number) {
    const button = this.querySelector(selector) as HTMLButtonElement;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let repeatTimer: ReturnType<typeof setInterval> | undefined;
    let repeated = false;

    const stopRepeat = () => {
      clearTimeout(holdTimer);
      clearInterval(repeatTimer);
      holdTimer = undefined;
      repeatTimer = undefined;
    };

    button.addEventListener('pointerdown', () => {
      repeated = false;
      holdTimer = setTimeout(() => {
        repeated = true;
        this.step(delta);
        repeatTimer = setInterval(() => this.step(delta), 80);
      }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((event) => {
      button.addEventListener(event, stopRepeat);
    });

    button.addEventListener('click', () => {
      if (repeated) {
        repeated = false;
        return;
      }
      this.step(delta);
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
