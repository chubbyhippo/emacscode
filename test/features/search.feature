Feature: Incremental literal search
  Scenario: Search forward and repeat through matches
    Given search text "one TWO one" at 0 in direction 1
    When the search query is "one"
    Then the search point is 3
    When I repeat search in direction 1
    Then the search point is 11
    When I repeat search in direction 1
    Then the search has failed
    When I repeat search in direction 1
    Then the search point is 3
    And the search has wrapped

  Scenario: Changing direction revisits the current match
    Given search text "one one" at 0 in direction 1
    When the search query is "one"
    And I repeat search in direction 1
    And I repeat search in direction -1
    Then the search point is 4

  Scenario: Failed extension rolls back to the last successful query
    Given search text "alpha beta" at 0 in direction 1
    When the search query is "alp"
    And the search query is "alpz"
    Then the search has failed
    When I roll back the failed search
    Then the active search query is "alp"
    And the search point is 3

  Scenario: Search backward from point
    Given search text "foo bar foo" at 11 in direction -1
    When the search query is "foo"
    Then the search point is 8
    When I repeat search in direction -1
    Then the search point is 0

  Scenario: Lowercase query ignores case and uppercase query is sensitive
    Given search text "Alpha alpha" at 0 in direction 1
    When the search query is "alpha"
    Then the search point is 5
    When the search query is "Alpha"
    Then the search point is 5

  Scenario: Literal punctuation is not a regular expression
    Given search text "a.b aXb" at 0 in direction 1
    When the search query is "a.b"
    Then the search point is 3
    When I repeat search in direction 1
    Then the search has failed

  Scenario: All matches follow incremental case-sensitive search rules
    Given search text "Alpha alpha ALPHA" at 0 in direction 1
    When the search query is "alpha"
    Then all search match ranges are "0-5,6-11,12-17"
    When the search query is "Alpha"
    Then all search match ranges are "0-5"
    When the search query is "missing"
    Then all search match ranges are ""
    When the search query is ""
    Then all search match ranges are ""

  Scenario: Overlapping matches are highlighted
    Given search text "banana" at 0 in direction 1
    When the search query is "ana"
    Then all search match ranges are "1-4,3-6"

  Scenario: Search highlights literal punctuation
    Given search text "a.b aXb a.b" at 0 in direction 1
    When the search query is "a.b"
    Then all search match ranges are "0-3,8-11"

  Scenario: Match count follows forward search and wrapping
    Given search text "one one one" at 0 in direction 1
    Then the search count is hidden
    When the search query is "one"
    Then the search count is 1 of 3
    When I repeat search in direction 1
    Then the search count is 2 of 3
    When I repeat search in direction 1
    And I repeat search in direction 1
    Then the search has failed
    And the search count is 3 of 3
    When I repeat search in direction 1
    Then the search count is 1 of 3

  Scenario: Backward search count is in buffer order
    Given search text "one one one" at 11 in direction -1
    When the search query is "one"
    Then the search count is 3 of 3
    When I repeat search in direction -1
    Then the search count is 2 of 3

  Scenario: Failed query has no current matching occurrence
    Given search text "one one" at 0 in direction 1
    When the search query is "one"
    And the search query is "ones"
    Then the search count is 0 of 0
    When I roll back the failed search
    Then the search count is 1 of 2

  Scenario: Failed search can find occurrences elsewhere
    Given search text "one two one" at 8 in direction 1
    When the search query is "two"
    Then the search has failed
    And the search count is 0 of 1

  Scenario: Overlapping matches each count separately
    Given search text "banana" at 0 in direction 1
    When the search query is "ana"
    Then the search count is 1 of 2
