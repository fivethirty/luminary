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
  });

  test('updates value through property', () => {
    const cube = document.createElement('calc-stat-cube') as StatCubeElement;
    document.body.appendChild(cube);

    cube.value = 5;

    const input = cube.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('5');
    expect(cube.value).toBe(5);
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

    // Mock focus method
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
});
