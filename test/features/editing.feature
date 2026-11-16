Feature: Emacs editing state
  Scenario: Exchanging point and mark
    Given text "alpha beta" at position 0
    When I set the mark and move forward 5 characters
    And I exchange point and mark
    Then point is 0 and mark is 5
    And the region is active

  Scenario: An empty region does not remove a line
    Given text "alpha beta" at position 0
    When I set the mark and kill the region
    Then the text is "alpha beta"

  Scenario: Consecutive forward kills append and yank
    Given text "alpha beta" at position 0
    When I kill the next word twice
    Then the newest kill is "alpha beta"
    When I yank
    Then the text is "alpha beta"
    And point is 10

  Scenario: Yank pop requires a previous yank
    Given text "alpha" at position 0
    When I try yank pop
    Then an error is reported
    And the text is "alpha"

  Scenario: Backward character respects surrogate pairs
    Given text "a😀b" at position 3
    When I move backward 1 character
    Then point is 1

  Scenario: Killing at end of line removes the newline
    Given text "alpha\nbeta" at position 5
    When I kill the line
    Then the text is "alphabeta"
    And the newest kill is "\n"

  Scenario: Repeat universal argument
    Given a fresh prefix argument
    When I enter the universal argument twice
    Then the consumed argument is 16
    And the prefix is no longer pending

  Scenario: A negative argument retains its sign after zero
    Given a fresh prefix argument
    When I enter negative digits 0 and 2
    Then the consumed argument is -2

  Scenario: Beginning of an empty first line stays at the start
    Given text "\nbeta" at position 0
    When I move to the beginning of the line
    Then point is 0

  Scenario: Consecutive backwards kills prepend
    Given text "alpha beta" at position 10
    When I kill the previous word twice
    Then the newest kill is "alpha beta"
    And the text is ""

  Scenario: Yank-pop rotates through earlier kills
    Given text "alpha beta" at position 0
    When I create two distinct kills and yank
    And I rotate the yank
    Then the text is " alpha"

  Scenario: Zap forward through the second matching character and yank
    Given text "abcAdefa!" at position 1
    When I zap 2 occurrences of "a"
    Then the text is "a!"
    And the newest kill is "bcAdefa"
    When I yank
    Then the text is "abcAdefa!"

  Scenario: Zap backward includes the matching character
    Given text "abcAdefa!" at position 9
    When I zap -2 occurrences of "a"
    Then the text is "abc"
    And the newest kill is "Adefa!"
    And point is 3

  Scenario: Uppercase target is case-sensitive
    Given text "abcAdefa!" at position 0
    When I zap 1 occurrences of "A"
    Then the text is "defa!"
    And the newest kill is "abcA"

  Scenario: A missing target leaves text unchanged
    Given text "alpha beta" at position 0
    When I zap 1 occurrences of "z"
    Then an error is reported
    And the text is "alpha beta"
    And point is 0

  Scenario: Zap handles Unicode code points
    Given text "a😀b😀c" at position 0
    When I zap 2 occurrences of "😀"
    Then the text is "c"
    And the newest kill is "a😀b😀"

  Scenario: Zero zap count leaves text unchanged
    Given text "alpha" at position 0
    When I zap 0 occurrences of "a"
    Then the text is "alpha"

  Scenario: Uppercase the remaining part of a word
    Given text "hello world" at position 2
    When I upcase 1 words
    Then the text is "heLLO world"
    And point is 5

  Scenario: Capitalize successive words
    Given text "hELLO wORLD" at position 0
    When I capitalize 2 words
    Then the text is "Hello World"
    And point is 11

  Scenario: Negative count changes previous words without moving point
    Given text "ONE TWO THREE" at position 8
    When I downcase -1 words
    Then the text is "ONE two THREE"
    And point is 8

  Scenario: Zero case count changes nothing
    Given text "hello" at position 2
    When I upcase 0 words
    Then the text is "hello"
    And point is 2

  Scenario: Case count beyond the end changes available words
    Given text "one two" at position 0
    When I upcase 5 words
    Then the text is "ONE TWO"
    And point is 7

  Scenario: Transpose adjacent characters
    Given text "abcd" at position 2
    When I transpose characters with count 1
    Then the text is "acbd"
    And point is 3

  Scenario: Transpose at line end
    Given text "ab\ncd" at position 2
    When I transpose characters with count 1
    Then the text is "ba\ncd"
    And point is 2

  Scenario: Negative transpose moves a character backward
    Given text "abcdef" at position 3
    When I transpose characters with count -1
    Then the text is "acbdef"
    And point is 2

  Scenario: Transpose at buffer start reports an error
    Given text "abcd" at position 0
    When I transpose characters with count 1
    Then an error is reported
    And the text is "abcd"

  Scenario: Transpose supplementary characters without splitting them
    Given text "a😀b" at position 1
    When I transpose characters with count 1
    Then the text is "😀ab"
    And point is 3

  Scenario: Delete whitespace around point
    Given text "left   right" at position 6
    When I delete horizontal whitespace around
    Then the text is "leftright"
    And point is 4

  Scenario: Delete whitespace only before point
    Given text "left   right" at position 6
    When I delete horizontal whitespace backward
    Then the text is "left right"
    And point is 4

  Scenario: Whitespace deletion does not cross a newline
    Given text "left  \n  right" at position 6
    When I delete horizontal whitespace around
    Then the text is "left\n  right"
    And point is 4

  Scenario: Move to indentation from inside a line
    Given text "  hello" at position 5
    When I move to indentation
    Then point is 2
    When I move to indentation
    Then point is 2

  Scenario: Indentation on an empty line stays at its boundary
    Given text "one\n\ntwo" at position 4
    When I move to indentation
    Then point is 4

  Scenario: Indentation stops at the end of a blank line
    Given text "one\n  \ntwo" at position 4
    When I move to indentation
    Then point is 6

  Scenario: Mark a word and extend the region
    Given text "alpha beta gamma" at position 0
    When I mark a word
    Then point is 0 and mark is 5
    And the region is active
    When I mark a word
    Then point is 0 and mark is 10

  Scenario: Mark previous words with a negative prefix
    Given text "alpha beta gamma" at position 11
    When I mark words with prefix -2
    Then point is 11 and mark is 0
    And the region is active

  Scenario: Zero prefix creates an empty active region
    Given text "alpha beta" at position 6
    When I mark words with prefix 0
    Then point is 6 and mark is 6
    And the region is active

  Scenario: Marking beyond the end leaves an empty region
    Given text "alpha" at position 5
    When I mark a word
    Then point is 5 and mark is 5
    And the region is active
