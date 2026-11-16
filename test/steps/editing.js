const { Given, When, Then, setWorldConstructor } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { EditorState, KillRing, PrefixArgument } = require('../../out/core/editor');

class EditingWorld {
  constructor() { this.ring = new KillRing(); this.error = undefined; }
}
setWorldConstructor(EditingWorld);
const unescape = value => value.replace(/\\n/g, '\n');
Given('text {string} at position {int}', function (text, point) { this.state = new EditorState(unescape(text), point, this.ring); });
Given('a fresh prefix argument', function () { this.prefix = new PrefixArgument(); });
When('I set the mark and move forward {int} characters', function (count) { this.state.setMark(); this.state.moveCharacter(count); });
When('I exchange point and mark', function () { this.state.exchange(); });
When('I set the mark and kill the region', function () { this.state.setMark(); this.state.region(); });
When('I kill the next word twice', function () { this.state.killWord(1); this.state.killWord(1); });
When('I yank', function () { this.state.yank(); });
When('I try yank pop', function () { try { this.state.yankPop(); } catch (error) { this.error = error; } });
When('I move backward {int} character', function (count) { this.state.moveCharacter(-count); });
When('I kill the line', function () { this.state.killLine(1); });
When('I enter the universal argument twice', function () { this.prefix.universal(); this.prefix.universal(); });
When('I enter negative digits {int} and {int}', function (first, second) { this.prefix.negative(); this.prefix.digit(first); this.prefix.digit(second); });
When('I move to the beginning of the line', function () { this.state.lineBoundary(false); });
When('I move to indentation', function () { this.state.backToIndentation(); });
When('I kill the previous word twice', function () { this.state.killWord(-1); this.state.killWord(-1); });
When('I create two distinct kills and yank', function () { this.state.killWord(1); this.state.moveCharacter(1); this.state.killWord(1); this.state.yank(); });
When('I rotate the yank', function () { this.state.yankPop(); });
When('I zap {int} occurrences of {string}', function (count, character) { try { this.state.zapToChar(unescape(character), count); } catch (error) { this.error = error; } });
When('I {word} {int} words', function (kind, count) { this.state.changeWordCase(kind, count); });
When('I transpose characters with count {int}', function (count) { try { this.state.transposeCharacters(count); } catch (error) { this.error = error; } });
When('I delete horizontal whitespace {word}', function (direction) { this.state.deleteHorizontalSpace(direction === 'backward'); });
Then('point is {int} and mark is {int}', function (point, mark) { assert.equal(this.state.point, point); assert.equal(this.state.mark, mark); });
Then('the region is active', function () { assert.equal(this.state.active, true); });
Then('the text is {string}', function (text) { assert.equal(this.state.text, unescape(text)); });
Then('the newest kill is {string}', function (text) { assert.equal(this.ring.current(), unescape(text)); });
Then('point is {int}', function (point) { assert.equal(this.state.point, point); });
Then('an error is reported', function () { assert.ok(this.error); });
Then('the consumed argument is {int}', function (count) { assert.equal(this.prefix.consume(), count); });
Then('the prefix is no longer pending', function () { assert.equal(this.prefix.pending, false); });
