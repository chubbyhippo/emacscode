const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { IncrementalSearch } = require('../../../out/core/search');

Given('search text {string} at {int} in direction {int}', function (text, point, direction) { this.search = new IncrementalSearch(text, point, direction); });
When('the search query is {string}', function (query) { this.search.setQuery(query); });
When('I repeat search in direction {int}', function (direction) { this.search.repeat(direction); });
When('I roll back the failed search', function () { assert.equal(this.search.rollbackFailure(), true); });
Then('the search point is {int}', function (point) { assert.equal(this.search.point, point); });
Then('the search has failed', function () { assert.equal(this.search.failed, true); });
Then('the search has wrapped', function () { assert.equal(this.search.wrapped, true); });
Then('the active search query is {string}', function (query) { assert.equal(this.search.query, query); });
Then('all search match ranges are {string}', function (ranges) { assert.deepEqual(this.search.allMatches.map(match => `${match.start}-${match.end}`), ranges ? ranges.split(',') : []); });
Then('the search count is {int} of {int}', function (current, total) { assert.deepEqual(this.search.matchCount, { current, total }); });
Then('the search count is hidden', function () { assert.equal(this.search.matchCount, undefined); });
