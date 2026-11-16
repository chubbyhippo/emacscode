const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { Registers } = require('../../out/core/registers');

Given('a fresh register collection', function () { this.registers = new Registers(); });
When('I store text {string} in register {string}', function (text, name) { this.registers.setText(name, text); });
When('I increment register {string} by {int}', function (name, amount) { this.registers.increment(name, amount); });
When('I try to increment register {string} by {int}', function (name, amount) { try { this.registers.increment(name, amount); } catch (error) { this.registerError = error; } });
When('I try to read register {string}', function (name) { try { this.registers.read(name); } catch (error) { this.registerError = error; } });
When('I try to store text in register {string}', function (name) { try { this.registers.setText(name, 'text'); } catch (error) { this.registerError = error; } });
Then('register {string} contains text {string}', function (name, text) { assert.deepEqual(this.registers.read(name), { kind: 'text', text }); });
Then('register {string} contains number {int}', function (name, value) { assert.deepEqual(this.registers.read(name), { kind: 'number', value }); });
Then('a register error is reported', function () { assert.ok(this.registerError); });
