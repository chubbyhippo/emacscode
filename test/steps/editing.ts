const { Given, When, Then, setWorldConstructor } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { EditorState, KillRing, PrefixArgument } = require('../../../out/core/editor');

class EditingWorld {
  ring = new KillRing();
  error: unknown;
}
setWorldConstructor(EditingWorld);
const unescape = (value) => value.replace(/\\r/g, '\r').replace(/\\n/g, '\n');
Given('text {string} at position {int}', function (text, point) {
  this.state = new EditorState(unescape(text), point, this.ring);
});
Given('a fresh prefix argument', function () {
  this.prefix = new PrefixArgument();
});
When('I set the mark and move forward {int} characters', function (count) {
  this.state.setMark();
  this.state.moveCharacter(count);
});
When('I exchange point and mark', function () {
  this.state.exchange();
});
When('I set the mark and kill the region', function () {
  this.state.setMark();
  this.state.region();
});
When('I set the mark', function () {
  this.state.setMark();
});
When('I cancel the mark', function () {
  this.state.cancel();
});
When('I try to {word} the region', function (operation) {
  try {
    this.state.region(operation === 'copy');
  } catch (error) {
    this.error = error;
  }
});
When('I kill the next word twice', function () {
  this.state.killWord(1);
  this.state.killWord(1);
});
When('I yank', function () {
  this.state.yank();
});
When('I try yank pop', function () {
  try {
    this.state.yankPop();
  } catch (error) {
    this.error = error;
  }
});
When('I move backward {int} character', function (count) {
  this.state.moveCharacter(-count);
});
When('I try moving {int} characters', function (count) {
  try {
    this.state.moveCharacter(count);
  } catch (error) {
    this.error = error;
  }
});
When('I delete {int} characters', function (count) {
  try {
    this.state.deleteCharacter(count, true);
  } catch (error) {
    this.error = error;
  }
});
When('I delete one character without a prefix', function () {
  try {
    this.state.deleteCharacter(1);
  } catch (error) {
    this.error = error;
  }
});
When('I delete backward with prefix {int}', function (count) {
  try {
    this.state.backwardDeleteCharacter(count, true);
  } catch (error) {
    this.error = error;
  }
});
When('I delete backward without a prefix', function () {
  try {
    this.state.backwardDeleteCharacter(1);
  } catch (error) {
    this.error = error;
  }
});
When('I kill the line', function () {
  try {
    this.state.killLine(1);
  } catch (error) {
    this.error = error;
  }
});
When('I kill the line with prefix {int}', function (count) {
  try {
    this.state.killLine(count, true);
  } catch (error) {
    this.error = error;
  }
});
When('I enter the universal argument twice', function () {
  this.prefix.universal();
  this.prefix.universal();
});
When('I enter negative digits {int} and {int}', function (first, second) {
  this.prefix.negative();
  this.prefix.digit(first);
  this.prefix.digit(second);
});
When('I move to the beginning of the line', function () {
  this.state.lineBoundary(false);
});
When('I move to the end of the line', function () {
  this.state.lineBoundary(true);
});
When('I move to the {word} of the line with prefix {int}', function (boundary, count) {
  this.state.lineBoundary(boundary === 'end', count);
});
When('I move forward {int} character', function (count) {
  this.state.moveCharacter(count);
});
When('I move forward {int} word', function (count) {
  this.state.moveWord(count);
});
When('I move backward {int} word', function (count) {
  this.state.moveWord(-count);
});
When('I move {int} paragraphs', function (count) {
  this.state.moveParagraph(count);
});
When('I move {int} sentences', function (count) {
  try {
    this.state.moveSentence(count);
  } catch (error) {
    this.error = error;
  }
});
When('I kill {int} sentences', function (count) {
  try {
    this.state.killSentence(count);
  } catch (error) {
    this.error = error;
  }
});
When('I go to line {int}', function (line) {
  this.state.gotoLine(line);
});
When('I try moving forward a word', function () {
  try {
    this.state.moveWord(1);
  } catch (error) {
    this.error = error;
  }
});
When('I kill the next word', function () {
  this.state.killWord(1);
});
When('I move down {int} line', function (count) {
  this.state.vertical(count);
});
When('I move up {int} line', function (count) {
  this.state.vertical(-count);
});
When('I add an older kill {string}', function (text) {
  this.ring.add(unescape(text), 'forward', false);
});
When('I move to indentation', function () {
  this.state.backToIndentation();
});
When('I mark a paragraph with count {int}', function (count) {
  try {
    this.state.markParagraph(count);
  } catch (error) {
    this.error = error;
  }
});
When('I mark a word', function () {
  this.state.markWord(1, false);
});
When('I mark words with prefix {int}', function (count) {
  this.state.markWord(count, true);
});
When('I kill the previous word twice', function () {
  this.state.killWord(-1);
  this.state.killWord(-1);
});
When('I create two distinct kills and yank', function () {
  this.state.killWord(1);
  this.state.moveCharacter(1);
  this.state.killWord(1);
  this.state.yank();
});
When('I rotate the yank', function () {
  this.state.yankPop();
});
When('I zap {int} occurrences of {string}', function (count, character) {
  try {
    this.state.zapToChar(unescape(character), count);
  } catch (error) {
    this.error = error;
  }
});
When('I {word} {int} words', function (kind, count) {
  this.state.changeWordCase(kind, count);
});
When('I transpose words with count {int}', function (count) {
  try {
    this.state.transposeWords(count);
  } catch (error) {
    this.error = error;
  }
});
When('I transpose characters with count {int}', function (count) {
  try {
    this.state.transposeCharacters(count);
  } catch (error) {
    this.error = error;
  }
});
When('I join lines with prefix {int}', function (prefix) {
  this.state.deleteIndentation(prefix !== 0);
});
When('I delete blank lines', function () {
  this.state.deleteBlankLines();
});
When('I cycle spacing', function () {
  this.state.cycleSpacing();
});
When('I cycle spacing with prefix {int}', function (count) {
  this.state.cycleSpacing(count);
});
When('I delete horizontal whitespace {word}', function (direction) {
  this.state.deleteHorizontalSpace(direction === 'backward');
});
Then('point is {int} and mark is {int}', function (point, mark) {
  assert.equal(this.state.point, point);
  assert.equal(this.state.mark, mark);
});
Then('the region is active', function () {
  assert.equal(this.state.active, true);
});
Then('the region is inactive', function () {
  assert.equal(this.state.active, false);
});
Then('the text is {string}', function (text) {
  assert.equal(this.state.text, unescape(text));
});
Then('the newest kill is {string}', function (text) {
  assert.equal(this.ring.current(), unescape(text));
});
Then('the kill ring contains {string} then {string}', function (first, second) {
  assert.deepEqual(this.ring.values(), [unescape(first), unescape(second)]);
});
Then('point is {int}', function (point) {
  assert.equal(this.state.point, point);
});
Then('an error is reported', function () {
  assert.ok(this.error);
});
Then('the consumed argument is {int}', function (count) {
  assert.equal(this.prefix.consume(), count);
});
Then('the prefix is no longer pending', function () {
  assert.equal(this.prefix.pending, false);
});
