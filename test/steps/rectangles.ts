const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { editRectangle, yankRectangle } = require('../../../out/core/rectangles');

const decode = text => text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
Given('rectangle text {string} with mark {int} and point {int}', function (text, mark, point) { this.rectangleText = decode(text); this.rectangleMark = mark; this.rectanglePoint = point; });
When('I perform rectangle {string}', function (action) { this.rectangleResult = editRectangle(this.rectangleText, this.rectangleMark, this.rectanglePoint, action); });
When('I try rectangle {string}', function (action) { try { this.rectangleResult = editRectangle(this.rectangleText, this.rectangleMark, this.rectanglePoint, action); } catch (error) { this.rectangleError = error; } });
When('I yank rectangle rows {string}', function (rows) { this.rectangleResult = yankRectangle(this.rectangleText, this.rectanglePoint, rows.split('|')); });
Then('rectangle text is {string}', function (text) { assert.equal(this.rectangleResult.text, decode(text)); });
Then('rectangle rows are {string}', function (rows) { assert.deepEqual(this.rectangleResult.rows, rows.split('|')); });
Then('rectangle point is {int}', function (point) { assert.equal(this.rectangleResult.point, point); });
Then('a rectangle error is reported', function () { assert.ok(this.rectangleError); });
Then('the original rectangle text is {string}', function (text) { assert.equal(this.rectangleText, decode(text)); });
