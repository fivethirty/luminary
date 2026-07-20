import { test, expect, beforeEach, describe } from 'bun:test';
import './index';
import type { StatCubeElement } from './index';

describe('StatCubeElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('initializes with default values', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    expect(cube.value).toBe(0);
    expect(cube.label).toBe('');

    const input = cube.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('0');
  });

  test('displays label correctly', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    cube.label = 'Hull';
    document.body.appendChild(cube);

    const labelEl = cube.querySelector('label');
    expect(labelEl?.textContent).toBe('Hull');
    expect(cube.querySelector('input')?.getAttribute('aria-label')).toBe(
      'Hull'
    );
  });

  test('uses contextual accessible labels for the field and steppers', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    cube.label = 'Comp';
    cube.accessibleLabel = 'Cruiser computer';
    document.body.appendChild(cube);

    expect(cube.querySelector('input')?.getAttribute('aria-label')).toBe(
      'Cruiser computer'
    );
    expect(cube.querySelector('.stat-dec')?.getAttribute('aria-label')).toBe(
      'Decrease Cruiser computer'
    );
    expect(cube.querySelector('.stat-inc')?.getAttribute('aria-label')).toBe(
      'Increase Cruiser computer'
    );
  });

  test('updates value through property', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    cube.value = 5;

    const input = cube.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('5');
    expect(cube.value).toBe(5);
  });

  test('marks values that differ from their default until restored', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    cube.defaultValue = 2;
    cube.value = 2;
    document.body.appendChild(cube);

    const input = cube.querySelector('input') as HTMLInputElement;
    const increment = cube.querySelector('.stat-inc') as HTMLButtonElement;
    const decrement = cube.querySelector('.stat-dec') as HTMLButtonElement;

    expect(cube.hasAttribute('modified')).toBe(false);
    expect(input.hasAttribute('aria-description')).toBe(false);

    increment.click();
    expect(cube.hasAttribute('modified')).toBe(true);
    expect(input.getAttribute('aria-description')).toBe(
      'Modified from default 2'
    );

    decrement.click();
    expect(cube.hasAttribute('modified')).toBe(false);
    expect(input.hasAttribute('aria-description')).toBe(false);
  });

  test('updates value through input', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    const input = cube.querySelector('input') as HTMLInputElement;

    input.value = '7';
    input.dispatchEvent(new Event('change'));

    expect(cube.value).toBe(7);
  });

  test('enforces max 2 digits', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    const input = cube.querySelector('input') as HTMLInputElement;

    input.value = '12345';
    input.dispatchEvent(new Event('input'));

    expect(input.value).toBe('12');
  });

  test('focuses input on click', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    const input = cube.querySelector('input') as HTMLInputElement;

    let focusCalled = false;
    input.focus = () => {
      focusCalled = true;
    };

    cube.click();

    expect(focusCalled).toBe(true);
  });

  test('prevents non-numeric beforeinput', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    const input = cube.querySelector('input') as HTMLInputElement;

    const letterEvent = new InputEvent('beforeinput', {
      data: 'a',
      inputType: 'insertText',
    });
    let letterPrevented = false;
    letterEvent.preventDefault = () => {
      letterPrevented = true;
    };

    input.dispatchEvent(letterEvent);
    expect(letterPrevented).toBe(true);

    const numberEvent = new InputEvent('beforeinput', {
      data: '1',
      inputType: 'insertText',
    });
    let numberPrevented = false;
    numberEvent.preventDefault = () => {
      numberPrevented = true;
    };

    input.dispatchEvent(numberEvent);
    expect(numberPrevented).toBe(false);
  });

  test('steppers increment and decrement with clamping', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    const inc = cube.querySelector('.stat-inc') as HTMLButtonElement;
    const dec = cube.querySelector('.stat-dec') as HTMLButtonElement;
    let changes = 0;
    cube.addEventListener('change', () => changes++);

    expect(dec.disabled).toBe(true);

    inc.click();
    inc.click();
    expect(cube.value).toBe(2);
    expect(dec.disabled).toBe(false);

    dec.click();
    dec.click();
    dec.click();
    expect(cube.value).toBe(0);

    expect(changes).toBe(4);

    cube.value = 99;
    expect(inc.disabled).toBe(true);
    inc.click();
    expect(cube.value).toBe(99);
  });

  test('supports arrow keys on the spinbutton input', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);
    const input = cube.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(cube.value).toBe(1);
    expect(input.getAttribute('aria-valuenow')).toBe('1');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(cube.value).toBe(0);
    expect(input.getAttribute('aria-valuenow')).toBe('0');
  });

  test('supports custom step and max constraints', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    cube.step = 2;
    cube.max = 5;
    document.body.appendChild(cube);

    const input = cube.querySelector('input') as HTMLInputElement;
    const inc = cube.querySelector('.stat-inc') as HTMLButtonElement;
    const dec = cube.querySelector('.stat-dec') as HTMLButtonElement;

    inc.click();
    expect(cube.value).toBe(2);
    inc.click();
    expect(cube.value).toBe(4);
    expect(inc.disabled).toBe(true);
    inc.click();
    expect(cube.value).toBe(4);

    input.value = '1';
    input.dispatchEvent(new Event('change'));
    expect(cube.value).toBe(2);
    expect(input.value).toBe('2');

    dec.click();
    expect(cube.value).toBe(0);
    expect(dec.disabled).toBe(true);
  });

  test('stepper clicks do not focus the input', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    const input = cube.querySelector('input') as HTMLInputElement;
    let focusCalled = false;
    input.focus = () => {
      focusCalled = true;
    };

    (cube.querySelector('.stat-inc') as HTMLButtonElement).click();
    expect(focusCalled).toBe(false);
  });

  test('touch stepper activation releases button focus', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);
    const increment = cube.querySelector('.stat-inc') as HTMLButtonElement;

    increment.dispatchEvent(
      new PointerEvent('pointerdown', { pointerType: 'touch' })
    );
    increment.focus();
    increment.click();

    expect(cube.value).toBe(1);
    expect(document.activeElement).not.toBe(increment);
  });

  test('mouse stepper activation does not force focus away', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);
    const increment = cube.querySelector('.stat-inc') as HTMLButtonElement;

    increment.dispatchEvent(
      new PointerEvent('pointerdown', { pointerType: 'mouse' })
    );
    increment.focus();
    increment.click();

    expect(cube.value).toBe(1);
    expect(document.activeElement).toBe(increment);
  });

  test('dispatches change event', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    let changeEventFired = false;
    cube.addEventListener('change', () => {
      changeEventFired = true;
    });

    const input = cube.querySelector('input') as HTMLInputElement;
    input.value = '10';
    input.dispatchEvent(new Event('change'));

    expect(changeEventFired).toBe(true);
  });

  test('disabled cube does not edit value', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    cube.value = 4;
    cube.disabled = true;
    document.body.appendChild(cube);

    const input = cube.querySelector('input') as HTMLInputElement;
    const inc = cube.querySelector('.stat-inc') as HTMLButtonElement;
    let changes = 0;
    cube.addEventListener('change', () => changes++);

    expect(input.disabled).toBe(true);
    expect(inc.disabled).toBe(true);

    inc.click();
    expect(cube.value).toBe(4);

    input.value = '9';
    input.dispatchEvent(new Event('change'));
    expect(cube.value).toBe(4);
    expect(input.value).toBe('4');
    expect(changes).toBe(0);
  });
});
