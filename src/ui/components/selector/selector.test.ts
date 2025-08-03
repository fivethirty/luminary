import { test, expect, beforeEach, describe } from 'bun:test';
import './index';
import type { SelectorElement } from '.';

describe('Selector', () => {
  let element: SelectorElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    element = document.createElement('calc-selector') as SelectorElement;
    document.body.appendChild(element);
  });

  function getElements() {
    return {
      value: element.querySelector('.selector > div'),
      decrement: element.querySelectorAll('button')[0] as HTMLButtonElement,
      increment: element.querySelectorAll('button')[1] as HTMLButtonElement,
    };
  }

  test('displays initial value', () => {
    element.value = 5;
    element.render();

    const { value } = getElements();
    expect(value?.textContent).toBe('5');
  });

  test('emits change events on button clicks', () => {
    let changeEventFired = false;
    let targetElement: SelectorElement | undefined;

    element.addEventListener('change', (e) => {
      changeEventFired = true;
      targetElement = e.target as SelectorElement;
    });

    element.value = 5;
    element.render();

    const { increment, decrement } = getElements();

    increment.click();
    expect(changeEventFired).toBe(true);
    expect(targetElement).toBe(element);
    expect(element.value).toBe(6);

    changeEventFired = false;
    decrement.click();
    expect(changeEventFired).toBe(true);
    expect(element.value).toBe(5);
  });

  test('respects maximum bound', () => {
    let changeEventFired = false;
    element.addEventListener('change', () => {
      changeEventFired = true;
    });

    element.value = 10;
    element.max = 10;
    element.render();

    const { increment } = getElements();
    increment.click();

    expect(changeEventFired).toBe(false);
    expect(element.value).toBe(10);
  });

  test('respects minimum bound', () => {
    let changeEventFired = false;
    element.addEventListener('change', () => {
      changeEventFired = true;
    });

    element.value = 0;
    element.min = 0;
    element.render();

    const { decrement } = getElements();
    decrement.click();

    expect(changeEventFired).toBe(false);
    expect(element.value).toBe(0);
  });

  test('defaults to 0 when not bound', () => {
    const { value } = getElements();
    expect(value?.textContent).toBe('0');
  });

  test('buttons are disabled at boundaries', () => {
    element.value = 10;
    element.max = 10;
    element.render();

    const { increment, decrement } = getElements();
    expect(increment.disabled).toBe(true);
    expect(decrement.disabled).toBe(false);

    element.value = 0;
    element.min = 0;
    element.render();

    expect(decrement.disabled).toBe(true);
    expect(increment.disabled).toBe(false);
  });

  test('setting value programmatically updates display', () => {
    element.value = 3;
    const { value } = getElements();
    expect(value?.textContent).toBe('3');

    element.value = 7;
    expect(value?.textContent).toBe('7');
  });
});
