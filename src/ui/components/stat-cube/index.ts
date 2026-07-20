import html from './stat-cube.html' with { type: 'text' };
import './stat-cube.css';

export class StatCubeElement extends HTMLElement {
  private _value: number = 0;
  private _label = '';
  private _accessibleLabel = '';
  private _sign = '';
  private _disabled = false;
  private _max = 99;
  private _step = 1;
  private input!: HTMLInputElement;
  private originalValue = '';

  static get observedAttributes() {
    return ['disabled', 'max', 'step'];
  }

  get value(): number {
    return this._value;
  }

  set value(val: number) {
    this._value = this.normalizeValue(val);
    if (this.input) {
      this.input.value = this.displayValue();
    }
    this.applyStepperState();
  }

  // The value as shown in the input, prefixed with the sign glyph when one is
  // set (e.g. '+3' for computers, '−2' for shields). The input is cleared for
  // digit-only editing while focused, so the sign only appears at rest.
  private displayValue(): string {
    return `${this._sign}${this.value}`;
  }

  get max(): number {
    return this._max;
  }

  set max(val: number) {
    this._max = Math.max(0, Math.floor(val));
    this.setAttribute('max', String(this._max));
    this.normalizeCurrentValue();
    this.applyInputConstraints();
  }

  get step(): number {
    return this._step;
  }

  set step(val: number) {
    this._step = Math.max(1, Math.floor(val));
    this.setAttribute('step', String(this._step));
    this.normalizeCurrentValue();
    this.applyInputConstraints();
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
      return;
    }

    const value = parseInt(this.getAttribute(name) || '', 10);
    if (name === 'max' && Number.isFinite(value)) {
      this._max = Math.max(0, Math.floor(value));
      this.normalizeCurrentValue();
      this.applyInputConstraints();
    }
    if (name === 'step' && Number.isFinite(value)) {
      this._step = Math.max(1, Math.floor(value));
      this.normalizeCurrentValue();
      this.applyInputConstraints();
    }
  }

  connectedCallback() {
    this.innerHTML = html;

    this.input = this.querySelector('input') as HTMLInputElement;
    const label = this.querySelector('label') as HTMLElement;

    this.input.value = this.displayValue();
    label.textContent = this._label;
    this.applyInputConstraints();
    this.applyDisabledState();
    this.applyStepperState();
    this.applyAccessibleLabels();

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

    this.input.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      this.adjustValue(e.key === 'ArrowUp' ? 1 : -1);
    });

    this.input.addEventListener('input', () => {
      this.input.value = this.input.value.replace(/[^0-9]/g, '');

      if (this.input.value.length > 2) {
        this.input.value = this.input.value.slice(0, 2);
      }
    });

    this.input.addEventListener('change', () => {
      if (this.disabled) {
        this.input.value = this.displayValue();
        return;
      }
      const newValue = parseInt(this.input.value) || 0;
      this.value = newValue;
      this.input.value = this.displayValue();

      this.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  private adjustValue(delta: number) {
    if (this.disabled) return;
    const previousValue = this.value;
    this.value = this.value + delta * this.step;
    if (this.value === previousValue) return;
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private normalizeValue(value: number): number {
    const max = Math.floor(this.max / this.step) * this.step;
    const clamped = Math.max(0, Math.min(max, Math.floor(value)));
    return Math.max(
      0,
      Math.min(max, Math.round(clamped / this.step) * this.step)
    );
  }

  private normalizeCurrentValue() {
    this._value = this.normalizeValue(this.value);
    if (this.input) {
      this.input.value = this.displayValue();
    }
    this.applyStepperState();
  }

  private effectiveMax(): number {
    return Math.floor(this.max / this.step) * this.step;
  }

  private applyInputConstraints() {
    if (!this.input) return;
    this.input.max = String(this.effectiveMax());
    this.input.step = String(this.step);
  }

  private applyDisabledState() {
    if (!this.input) return;
    this.input.disabled = this.disabled;
    this.applyStepperState();
  }

  private applyStepperState() {
    const dec = this.querySelector('.stat-dec') as HTMLButtonElement | null;
    const inc = this.querySelector('.stat-inc') as HTMLButtonElement | null;
    if (!dec || !inc) return;

    dec.disabled = this.disabled || this.value <= 0;
    inc.disabled = this.disabled || this.value >= this.effectiveMax();
    if (this.input) {
      this.input.setAttribute('aria-valuemin', '0');
      this.input.setAttribute('aria-valuemax', String(this.effectiveMax()));
      this.input.setAttribute('aria-valuenow', String(this.value));
      this.input.setAttribute('aria-disabled', String(this.disabled));
    }
  }

  private applyAccessibleLabels() {
    if (!this.input) return;
    const label = this.accessibleLabel || this.label || 'Stat';
    this.input.setAttribute('aria-label', label);
    this.querySelector('.stat-dec')?.setAttribute(
      'aria-label',
      `Decrease ${label}`
    );
    this.querySelector('.stat-inc')?.setAttribute(
      'aria-label',
      `Increase ${label}`
    );
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
        this.adjustValue(delta);
        repeatTimer = setInterval(() => this.adjustValue(delta), 80);
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
      this.adjustValue(delta);
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
    this.applyAccessibleLabels();
  }

  get accessibleLabel(): string {
    return this._accessibleLabel;
  }

  set accessibleLabel(val: string) {
    this._accessibleLabel = val;
    this.applyAccessibleLabels();
  }

  // A sign glyph shown just before the value (e.g. '+' for computers, '−' for
  // shields) to hint how the stat shifts a to-hit roll. Purely cosmetic — the
  // stored value stays a plain unsigned number and the field is edited as
  // digits only.
  get sign(): string {
    return this._sign;
  }

  set sign(val: string) {
    this._sign = val;
    // Don't clobber an in-progress edit; the sign reappears on the next render.
    if (this.input && document.activeElement !== this.input) {
      this.input.value = this.displayValue();
    }
  }
}

customElements.define('calc-stat-cube', StatCubeElement);
