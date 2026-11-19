const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { Registers } = require('../../../out/core/registers');
const { EditorState, KillRing } = require('../../../out/core/editor');

Given('an active register region from {int} to {int} in {string}', function (mark, point, text) {
  this.registerState = new EditorState(text, point, new KillRing());
  this.registerState.mark = mark;
  this.registerState.active = true;
});
When(
  'I run register increment for {string} with prefix {int} and no deletion',
  function (name, amount) {
    this.registers.prepareIncrement(this.registerState, name, amount, false)();
  },
);
When(
  'I run register increment for {string} with prefix {int} and deletion',
  function (name, amount) {
    this.registers.prepareIncrement(this.registerState, name, amount, true)();
  },
);
When('I prepare but reject register increment for {string}', function (name) {
  this.registers.prepareIncrement(this.registerState, name, 4, true);
});
Then(
  'the register buffer is {string} with point {int} and mark {int} inactive',
  function (text, point, mark) {
    assert.deepEqual(
      {
        text: this.registerState.text,
        point: this.registerState.point,
        mark: this.registerState.mark,
        active: this.registerState.active,
      },
      { text, point, mark, active: false },
    );
  },
);

Given('a fresh register collection', function () {
  this.registers = new Registers();
});
When('I store text {string} in register {string}', function (text, name) {
  this.registers.setText(name, text);
});
When(
  'I store rectangle rows {string} and {string} in register {string}',
  function (first, second, name) {
    this.registers.setRectangle(name, [first, second]);
  },
);
Then(
  'register {string} contains rectangle rows {string} and {string}',
  function (name, first, second) {
    assert.deepEqual(this.registers.read(name), { kind: 'rectangle', rows: [first, second] });
  },
);
When('I store number {int} in register {string}', function (value, name) {
  this.registers.setNumber(name, value);
});
When('I increment register {string} by {int}', function (name, amount) {
  this.registers.prepareIncrement(new EditorState('', 0, new KillRing()), name, amount, true)();
});
When('I try to increment register {string} by {int}', function (name, amount) {
  try {
    this.registers.prepareIncrement(new EditorState('', 0, new KillRing()), name, amount, true)();
  } catch (error) {
    this.registerError = error;
  }
});
When('I try to read register {string}', function (name) {
  try {
    this.registers.read(name);
  } catch (error) {
    this.registerError = error;
  }
});
When('I try to store text in register {string}', function (name) {
  try {
    this.registers.setText(name, 'text');
  } catch (error) {
    this.registerError = error;
  }
});
Then('register {string} contains text {string}', function (name, text) {
  assert.deepEqual(this.registers.read(name), { kind: 'text', text });
});
Then('register {string} contains number {int}', function (name, value) {
  assert.deepEqual(this.registers.read(name), { kind: 'number', value });
});
Then('a register error is reported', function () {
  assert.ok(this.registerError);
});
