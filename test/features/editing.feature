Feature: Emacs editing state
  @SC-movement-forward-character @global-993ac457822f70ee
  Scenario: Move forward one character
    Given text "abc" at position 1
    When I move forward 1 character
    Then point is 2
    And the text is "abc"

  @SC-movement-backward-character @global-8c4e3b701ae0ee96
  Scenario: Move backward one character
    Given text "abc" at position 1
    When I move backward 1 character
    Then point is 0
    And the text is "abc"

  Scenario: Exchanging point and mark
    Given text "alpha beta" at position 0
    When I set the mark and move forward 5 characters
    And I exchange point and mark
    Then point is 0 and mark is 5
    And the region is active

  @SC-exchange-prefixed
  Scenario: A prefix exchanges point and mark without activating the region
    Given text "alpha beta" at position 0
    When I set the mark and move forward 5 characters
    And I exchange point and mark with a prefix
    Then point is 0 and mark is 5
    And the region is inactive
    When I exchange point and mark
    Then point is 5 and mark is 0
    And the region is active
    And the text is "alpha beta"

  @SC-exchange-inactive
  Scenario: A prefix exchanges an inactive mark without activating it
    Given text "alpha beta" at position 0
    When I set the mark and move forward 5 characters
    And I cancel the mark
    And I exchange point and mark with a prefix
    Then point is 0 and mark is 5
    And the region is inactive

  @SC-exchange-unset
  Scenario: A prefixed exchange without a mark leaves the buffer unchanged
    Given text "alpha beta" at position 2
    When I exchange point and mark with a prefix
    Then an error is reported
    And point is 2
    And the region is inactive
    And the text is "alpha beta"

  Scenario: An empty region does not remove a line
    Given text "alpha beta" at position 0
    When I set the mark and kill the region
    Then the text is "alpha beta"

  Scenario Outline: An unset or inactive mark cannot kill or copy a line
    Given text "alpha beta" at position 0
    When I add an older kill "older"
    And I try to <operation> the region
    Then an error is reported
    And the text is "alpha beta"
    And the newest kill is "older"
    Examples:
      | operation |
      | kill      |
      | copy      |

  Scenario Outline: A cancelled mark cannot kill or copy a line
    Given text "alpha beta" at position 0
    When I add an older kill "older"
    And I set the mark
    And I move forward 1 character
    And I cancel the mark
    And I try to <operation> the region
    Then an error is reported
    And the text is "alpha beta"
    And the newest kill is "older"
    Examples:
      | operation |
      | kill      |
      | copy      |

  Scenario Outline: An empty active region preserves text and stores an empty kill
    Given text "alpha beta" at position 0
    When I add an older kill "older"
    And I set the mark
    And I try to <operation> the region
    Then the text is "alpha beta"
    And the kill ring contains "" then "older"
    Examples:
      | operation |
      | kill      |
      | copy      |

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

  @SC-buffer-boundary-numeric
  Scenario: Numeric buffer movement respects CRLF, Unicode and an active mark
    Given text "a😀b\r\n猫c\r\nd" at position 0
    When I set the mark
    And I move to the beginning of the buffer with numeric prefix 4
    Then point is 10 and mark is 0
    And the region is active
    And the text is "a😀b\r\n猫c\r\nd"

  @SC-buffer-boundary-mark
  Scenario: Unprefixed buffer movement retains the original point as an inactive mark
    Given text "alpha beta" at position 5
    When I move to the beginning of the buffer without a prefix
    Then point is 0 and mark is 5
    And the region is inactive
    When I exchange point and mark
    Then point is 5 and mark is 0
    And the region is active

  @SC-buffer-boundary-universal
  Scenario: A universal prefix preserves an inactive mark
    Given text "alpha beta" at position 2
    When I set the mark
    And I move forward 3 character
    And I cancel the mark
    And I move to the end of the buffer with a universal prefix
    Then point is 10 and mark is 2
    And the region is inactive

  @SC-structure-motion
  Scenario: Move over nested expressions and keep the active mark
    Given text "one (two [three]) end" at position 0
    When I set the mark
    And I move 2 sexp expressions
    Then point is 17 and mark is 0
    And the region is active
    When I move -1 sexp expressions
    Then point is 4 and mark is 0
    And the text is "one (two [three]) end"

  @SC-structure-escaped-atom
  Scenario: Escaped spaces join adjacent words into one expression
    Given text with an escaped space at position 0
    When I set the mark
    And I move 1 sexp expressions
    Then point is 4 and mark is 0
    And the region is active
    When I move -1 sexp expressions
    Then point is 0 and mark is 0

  @SC-structure-incomplete-escape
  Scenario: A trailing escape fails forward movement and preserves the mark
    Given text with a trailing escape at position 0
    When I set the mark
    And I move 1 sexp expressions
    Then an error is reported
    And point is 0 and mark is 0
    And the region is active

  @SC-structure-unbalanced
  Scenario: Unbalanced expressions report an error without changing the region
    Given text "(unfinished" at position 0
    When I set the mark
    And I move 1 sexp expressions
    Then an error is reported
    And point is 0 and mark is 0
    And the region is active

  @SC-structure-partial-error
  Scenario: Failed repeated list descent retains the completed movement and mark
    Given text "(a)" at position 0
    When I set the mark
    And I move into 2 nested lists
    Then an error is reported
    And point is 1 and mark is 0
    And the region is active
    And the text is "(a)"

  @SC-structure-trailing-space
  Scenario: Moving beyond the last expression reaches the buffer boundary
    Given text "abc   " at position 0
    When I move 2 sexp expressions
    Then point is 6
    And the text is "abc   "

  @SC-sexp-edit
  Scenario: Mark and kill a balanced expression and yank it back
    Given text "one (two) three" at position 4
    When I mark a sexp
    Then point is 4 and mark is 9
    And the region is active
    When I kill a sexp
    Then the text is "one  three"
    And the newest kill is "(two)"
    When I yank
    Then the text is "one (two) three"

  @SC-sexp-kill-recovery
  Scenario: A failed structural kill breaks the consecutive kill chain
    Given text "one ) two" at position 0
    When I add an older kill "older"
    And I kill a sexp
    Then the text is " ) two"
    And the kill ring contains "one" then "older"
    When I kill a sexp
    Then an error is reported
    And the text is " ) two"
    And the kill ring contains "one" then "older"
    When I kill the next word
    Then the text is ""
    And the newest kill is " ) two"

  @SC-sexp-mark-repeat
  Scenario: Repeated structural marking extends the active region
    Given text "one (two) x" at position 0
    When I mark a sexp
    Then point is 0 and mark is 3
    And the region is active
    When I mark a sexp
    Then point is 0 and mark is 9
    And the text is "one (two) x"

  @SC-sexp-mark-reversed
  Scenario: A negative prefix extends a reversed region backward
    Given text "one (two) x" at position 11
    When I mark a sexp with prefix -1
    Then point is 11 and mark is 10
    And the region is active
    When I mark a sexp
    Then point is 11 and mark is 4
    And the text is "one (two) x"

  @SC-sexp-mark-failure
  Scenario: Failed structural marking preserves the active region and kill ring
    Given text "a) b" at position 0
    When I add an older kill "older"
    And I set the mark
    And I mark a sexp with prefix 2
    Then an error is reported
    And point is 0 and mark is 0
    And the region is active
    And the newest kill is "older"
    And the text is "a) b"

  @SC-sexp-transpose
  Scenario: Transpose adjacent expressions
    Given text "(one) (two)" at position 5
    When I transpose sexps
    Then the text is "(two) (one)"
    And point is 11

  @SC-sexp-transpose-negative
  Scenario: A negative prefix moves the previous expression backward
    Given text "one two three" at position 0
    When I set the mark
    And I move forward 7 character
    And I transpose sexps with count -1
    Then the text is "two one three"
    And point is 3 and mark is 0
    And the region is inactive

  @SC-sexp-transpose-empty
  Scenario: Transposing at an empty buffer preserves an active mark
    Given text "" at position 0
    When I set the mark
    And I transpose sexps
    Then point is 0 and mark is 0
    And the region is active
    And the text is ""

  @SC-sexp-transpose-overlap
  Scenario: Overlapping marked expressions report an error without editing
    Given text "one two three" at position 0
    When I set the mark
    And I add an older kill "older"
    And I transpose sexps with count 0
    Then an error is reported
    And point is 0 and mark is 0
    And the region is active
    And the newest kill is "older"
    And the text is "one two three"

  @SC-fill-paragraph
  Scenario: Fill plain text while preserving the paragraph boundary
    Given text "one two three four\r\n\r\nnext" at position 0
    When I fill a paragraph to width 9
    Then the text is "one two\r\nthree\r\nfour\r\n\r\nnext"

  @SC-fill-point
  Scenario: Filling preserves point and mark relative to the text
    Given text "one  two three" at position 5
    When I set the mark
    And I fill a paragraph to width 8
    Then the text is "one two\nthree"
    And point is 4 and mark is 4
    And the region is inactive

  @SC-fill-active-reject
  Scenario: Filling a nonempty active region is rejected without editing
    Given text "one  two three" at position 0
    When I set the mark
    And I move forward 3 character
    And I fill a paragraph to width 8
    Then an error is reported
    And the text is "one  two three"
    And point is 3 and mark is 0
    And the region is active

  @SC-dabbrev
  Scenario: Cycle abbreviation expansions in the current buffer
    Given text "alpha alpine al" at position 15
    When I expand an abbreviation
    Then the text is "alpha alpine alpine"
    When I expand an abbreviation
    Then the text is "alpha alpine alpha"

  @SC-dabbrev-exhaustion
  Scenario: Exhausting abbreviation candidates restores the original prefix
    Given text "alpha al" at position 8
    When I expand an abbreviation
    Then the text is "alpha alpha"
    When I expand an abbreviation
    Then an error is reported
    And the text is "alpha al"
    And point is 8

  @SC-dabbrev-case
  Scenario: Expansion follows the uppercase abbreviation's case
    Given text "alphabet alpha AL" at position 17
    When I expand an abbreviation
    Then the text is "alphabet alpha ALPHA"
    When I expand an abbreviation
    Then the text is "alphabet alpha ALPHABET"

  @SC-dabbrev-mixed-case
  Scenario: Expansion preserves a matching mixed-case candidate
    Given text "fooBar fo" at position 9
    When I expand an abbreviation
    Then the text is "fooBar fooBar"
    When I expand an abbreviation
    Then an error is reported
    And the text is "fooBar fo"

  @SC-dabbrev-prefix-recovery
  Scenario: A failed explicit prefix resets the earlier expansion cycle
    Given text "alpha al" at position 8
    When I expand an abbreviation
    Then the text is "alpha alpha"
    When I expand an abbreviation with prefix 2
    Then an error is reported
    And the text is "alpha alpha"
    When I expand an abbreviation
    Then the text is "alpha alpha"

  @SC-dabbrev-zero-forward
  Scenario: A zero prefix searches forward when there is no preceding match
    Given text "al alpha alpine" at position 2
    When I expand an abbreviation with prefix 0
    Then the text is "alpha alpha alpine"
    And point is 5
    When I expand an abbreviation
    Then the text is "alpine alpha alpine"
    And point is 6

  @SC-dabbrev-zero-backward
  Scenario: A zero prefix prefers preceding matches and then searches forward
    Given text "alpha al alpine" at position 8
    When I expand an abbreviation with prefix 0
    Then the text is "alpha alpha alpine"
    When I expand an abbreviation
    Then the text is "alpha alpine alpine"

  @SC-quoted-insert
  Scenario: Insert a quoted character repeatedly
    Given text "ab" at position 1
    When I insert quoted "x" 3 times
    Then the text is "axxxb"
    And point is 4

  @SC-goto-character
  Scenario: Go to an Emacs character position across Unicode and CRLF
    Given text "a😀\r\nb" at position 0
    When I set the mark
    And I go to character 4
    Then point is 5 and mark is 0
    And the region is active
    When I go to character 99
    Then point is 6 and mark is 0

  @SC-move-column
  Scenario: Move to a tab-expanded column without inserting text
    Given text "a\tb\r\nnext" at position 0
    When I set the mark
    And I move to column 2 with tab size 4
    Then point is 2 and mark is 0
    And the region is active
    When I move to column 99 with tab size 4
    Then point is 3 and mark is 0
    And the text is "a\tb\r\nnext"

  @SC-move-column-unsupported
  Scenario: Unsupported display widths preserve point and mark
    Given text "猫a" at position 0
    When I set the mark
    And I move to column 1 with tab size 4
    Then an error is reported
    And point is 0 and mark is 0
    And the region is active

  @SC-goto-line
  Scenario Outline: Go to numbered lines while retaining an active mark
    Given text "one\r\ntwo\r\nthree" at position 1
    When I set the mark
    And I go to line <line>
    Then point is <point> and mark is 1
    And the region is active
    And the text is "one\r\ntwo\r\nthree"
    Examples:
      | line | point |
      | 0    | 0     |
      | 2    | 5     |
      | 9    | 15    |

  @SC-sentence-motion
  Scenario: Move across sentences with an active mark and signed counts
    Given text "One.  Two!  Three?" at position 0
    When I set the mark
    And I move 2 sentences
    Then point is 10 and mark is 0
    And the region is active
    When I move -1 sentences
    Then point is 6 and mark is 0
    And the region is active
    And the text is "One.  Two!  Three?"

  @SC-sentence-boundary
  Scenario: Forward motion past the buffer retains partial movement and the mark
    Given text "One." at position 0
    When I set the mark
    And I move 2 sentences
    Then an error is reported
    And point is 4 and mark is 0
    And the region is active
    And the text is "One."

  @SC-sentence-crlf
  Scenario: Sentence motion preserves CRLF and supplementary characters
    Given text "😀first.\r\nSecond." at position 0
    When I move 1 sentences
    Then point is 8
    And the text is "😀first.\r\nSecond."
    When I move 1 sentences
    Then point is 17
    When I move -1 sentences
    Then point is 10

  @SC-kill-sentence-forward
  Scenario: Consecutive sentence kills append and yank restores the text
    Given text "One.  Two!  Three?" at position 0
    When I kill 1 sentences
    And I kill 1 sentences
    Then the text is "  Three?"
    And the newest kill is "One.  Two!"
    When I yank
    Then the text is "One.  Two!  Three?"

  @SC-kill-sentence-backward
  Scenario: Backward sentence kills prepend to the kill ring
    Given text "One.  Two!  Three?" at position 18
    When I kill -1 sentences
    And I kill -1 sentences
    Then the text is "One.  "
    And the newest kill is "Two!  Three?"
    And point is 6

  @SC-kill-sentence-zero
  Scenario: A zero sentence count preserves text and creates an empty kill
    Given text "One.  Two." at position 2
    When I add an older kill "older"
    And I set the mark
    And I kill 0 sentences
    Then the text is "One.  Two."
    And the kill ring contains "" then "older"
    And the region is inactive

  @SC-kill-sentence-error
  Scenario: An oversized forward kill leaves text and ring unchanged after partial motion
    Given text "One." at position 0
    When I set the mark
    And I add an older kill "older"
    And I kill 2 sentences
    Then an error is reported
    And the text is "One."
    And the newest kill is "older"
    And point is 4 and mark is 0
    And the region is active

  @SC-kill-sentence-crlf
  Scenario: Sentence killing and yanking preserve CRLF and Unicode
    Given text "😀first.\r\nSecond." at position 0
    When I kill 2 sentences
    Then the text is ""
    And the newest kill is "😀first.\r\nSecond."
    When I yank
    Then the text is "😀first.\r\nSecond."

  @SC-paragraph-motion
  Scenario: Move across paragraphs with an active mark and prefixes
    Given text "one\nline\n\ntwo\n\nthree" at position 1
    When I set the mark
    And I move 2 paragraphs
    Then point is 14 and mark is 1
    And the region is active
    When I move -1 paragraphs
    Then point is 9 and mark is 1
    And the region is active

  @SC-mark-paragraph
  Scenario: Mark a paragraph and extend the mark by another paragraph
    Given text "one\n\ntwo\n\nthree" at position 1
    When I mark a paragraph with count 1
    Then point is 0 and mark is 4
    And the region is active
    When I mark a paragraph with count 1
    Then point is 0 and mark is 9
    And the region is active

  @SC-mark-paragraph-zero
  Scenario: A zero prefix reports an error and preserves the active region
    Given text "one\n\ntwo" at position 1
    When I set the mark
    And I mark a paragraph with count 0
    Then an error is reported
    And point is 1 and mark is 1
    And the region is active
    And the text is "one\n\ntwo"

  @SC-paragraph-crlf
  Scenario: Paragraph movement preserves CRLF and supplementary characters
    Given text "😀one\r\n\r\ntwo" at position 0
    When I move 1 paragraphs
    Then point is 7
    And the text is "😀one\r\n\r\ntwo"
    When I move -1 paragraphs
    Then point is 0

  Scenario: Backward character respects surrogate pairs
    Given text "a😀b" at position 3
    When I move backward 1 character
    Then point is 1

  Scenario Outline: Character motion reports buffer boundaries after partial movement
    Given text "<text>" at position <start>
    When I set the mark
    And I try moving <count> characters
    Then point is <end> and mark is <start>
    And the region is active
    And an error is reported
    And the text is "<text>"
    Examples:
      | text    | start | count | end |
      | abc     | 1     | 3     | 3   |
      | abc     | 2     | -3    | 0   |
      | a😀b    | 1     | 3     | 4   |
      | a\r\nb | 1     | 3     | 4   |
      |         | 0     | 1     | 0   |

  @SC-open-line-positive
  Scenario: Opening lines preserves point and moves a later mark
    Given text "ab\r\ncd" at position 6
    When I set the mark
    And I move backward 4 character
    And I open 2 lines
    Then the text is "a\r\n\r\nb\r\ncd"
    And point is 1 and mark is 10
    And the region is inactive

  @SC-open-line-zero
  Scenario: A zero line count moves to line end without editing or deactivating the mark
    Given text "abc\r\ndef" at position 1
    When I set the mark
    And I open 0 lines
    Then the text is "abc\r\ndef"
    And point is 3 and mark is 1
    And the region is active

  @SC-open-line-negative
  Scenario: A negative line count reports an error and preserves the region
    Given text "abc" at position 1
    When I set the mark
    And I open -1 lines
    Then an error is reported
    And the text is "abc"
    And point is 1 and mark is 1
    And the region is active

  @SC-delete-character-boundary
  Scenario Outline: Overshooting character deletion leaves the buffer and region unchanged
    Given text "abc" at position <start>
    When I set the mark
    And I add an older kill "older"
    And I delete <count> characters
    Then the text is "abc"
    And point is <start> and mark is <start>
    And the region is active
    And the newest kill is "older"
    And an error is reported
    Examples:
      | start | count |
      | 1     | 9     |
      | 1     | -2    |

  @SC-delete-character-prefix
  Scenario: Prefixed deletion kills and subsequent kills append
    Given text "abcdef" at position 2
    When I delete 1 characters
    And I delete 1 characters
    Then the text is "abef"
    And the newest kill is "cd"
    And point is 2

  @SC-delete-character-zero
  Scenario: A zero prefix creates an empty kill and deactivates the mark
    Given text "abc" at position 1
    When I set the mark
    And I add an older kill "older"
    And I delete 0 characters
    Then the text is "abc"
    And point is 1 and mark is 1
    And the region is inactive
    And the kill ring contains "" then "older"

  @SC-delete-character-crlf
  Scenario: Unprefixed deletion removes a CRLF as one character without killing
    Given text "a\r\nb" at position 1
    When I add an older kill "older"
    And I delete one character without a prefix
    Then the text is "ab"
    And the newest kill is "older"
    And point is 1

  @SC-delete-character-supplementary
  Scenario: Prefixed backward deletion kills a supplementary character intact
    Given text "a😀b" at position 3
    When I delete -1 characters
    Then the text is "ab"
    And the newest kill is "😀"
    And point is 1

  @SC-backward-delete-region
  Scenario: Backspace deletes a nonempty active region without adding a kill
    Given text "abcdef" at position 1
    When I set the mark
    And I move forward 3 character
    And I add an older kill "older"
    And I delete backward without a prefix
    Then the text is "aef"
    And point is 1 and mark is 1
    And the region is inactive
    And the newest kill is "older"

  @SC-backward-delete-empty-mark
  Scenario: Backspace at an empty active region deletes the preceding character
    Given text "abc" at position 2
    When I set the mark
    And I delete backward without a prefix
    Then the text is "ac"
    And point is 1 and mark is 1
    And the region is inactive

  @SC-backward-delete-prefix
  Scenario: Consecutive prefixed backward deletes prepend to the kill ring
    Given text "abcd" at position 3
    When I delete backward with prefix 1
    And I delete backward with prefix 1
    Then the text is "ad"
    And point is 1
    And the newest kill is "bc"

  @SC-backward-delete-error
  Scenario: An oversized backward prefix preserves text and active mark
    Given text "abc" at position 1
    When I set the mark
    And I delete backward with prefix 2
    Then an error is reported
    And the text is "abc"
    And point is 1 and mark is 1
    And the region is active

  @SC-backward-delete-crlf
  Scenario: Backspace deletes a CRLF as one character
    Given text "a\r\nb" at position 3
    When I delete backward without a prefix
    Then the text is "ab"
    And point is 1

  Scenario Outline: Combining marks remain attached during word motion
    Given text "<text>" at position <start>
    When I move forward 1 word
    Then point is <end>
    When I move backward 1 word
    Then point is <beginning>
    Examples:
      | text       | start | end | beginning |
      | éCOLE fin | 0     | 6   | 0         |
      | éCOLE fin | 1     | 6   | 0         |
      | क्‍ष fin    | 0     | 2   | 0         |
      | ́abc fin   | 0     | 4   | 1         |
      | a𞀀b fin   | 0     | 4   | 0         |

  Scenario: Killing a decomposed word preserves its combining mark
    Given text "école fin" at position 0
    When I kill the next word
    Then the text is " fin"
    And the newest kill is "école"
    When I yank
    Then the text is "école fin"

  Scenario: Capitalizing a decomposed word does not capitalize after the mark
    Given text "éCOLE fin" at position 0
    When I capitalize 1 words
    Then the text is "École fin"
    And point is 6

  Scenario: Capitalization starting before an attached mark continues the existing word
    Given text "éCOLE fin" at position 1
    When I capitalize 1 words
    Then the text is "école fin"
    And point is 6

  Scenario: Word movement preserves supplementary letters
    Given text "a𐐀b c" at position 0
    When I move forward 1 word
    Then point is 4
    When I move backward 1 word
    Then point is 0

  Scenario: Word movement skips supplementary non-letters intact
    Given text "😀𐐀b!" at position 0
    When I move forward 1 word
    Then point is 5
    When I move backward 1 word
    Then point is 2

  Scenario: Killing and yanking a supplementary word preserves every character
    Given text "a𐐀b c" at position 0
    When I kill the next word
    Then the text is " c"
    And the newest kill is "a𐐀b"
    When I yank
    Then the text is "a𐐀b c"

  Scenario: Marking a supplementary word never splits a character
    Given text "a𐐀b c" at position 0
    When I mark a word
    Then point is 0 and mark is 4
    And the region is active

  Scenario: Word movement rejects a point inside a surrogate pair
    Given text "a𐐀b" at position 2
    When I try moving forward a word
    Then an error is reported
    And point is 2
    And the text is "a𐐀b"

  Scenario: Vertical movement avoids splitting a supplementary character
    Given text "a\n𐐀b" at position 1
    When I move down 1 line
    Then point is 2
    When I move forward 1 word
    Then point is 5

  @SC-persistent-goal
  Scenario: A persistent goal survives horizontal movement until cleared
    Given text "abcde\nx\n0123456789" at position 4
    When I set the goal column
    And I move to the beginning of the line
    And I move down 1 line
    Then point is 7
    When I move down 1 line
    Then point is 12
    When I clear the goal column
    And I move to the beginning of the line
    And I move up 1 line
    Then point is 6

  @SC-vertical-tabs-goal
  Scenario: Vertical movement retains a tab-expanded goal across short CRLF lines
    Given text "a\tb\r\nshort\r\n0123456789" at position 2
    When I set the mark
    And I move down 1 line
    Then point is 10 and mark is 2
    And the region is active
    When I move down 1 line
    Then point is 20 and mark is 2
    When I move up 1 line
    Then point is 10 and mark is 2
    And the text is "a\tb\r\nshort\r\n0123456789"

  @SC-vertical-boundary-end
  Scenario: Oversized downward movement signals an error and preserves the mark
    Given text "abc\r\nx" at position 2
    When I set the mark
    And I try moving vertically 3 lines
    Then an error is reported
    And point is 6 and mark is 2
    And the region is active
    And the text is "abc\r\nx"
    When I move up 1 line
    Then point is 2 and mark is 2
    And the region is active

  @SC-vertical-boundary-start
  Scenario: Oversized upward movement signals an error and preserves the mark
    Given text "abc\r\nx" at position 6
    When I set the mark
    And I try moving vertically -3 lines
    Then an error is reported
    And point is 0 and mark is 6
    And the region is active
    When I move down 1 line
    Then point is 6 and mark is 6
    And the region is active

  @SC-vertical-tabs-crossing
  Scenario: A target inside a tab stops after the tab
    Given text "abc\n\txyz" at position 2
    When I move down 1 line
    Then point is 5
    When I move up 1 line
    Then point is 2

  Scenario: Killing at end of line removes the newline
    Given text "alpha\nbeta" at position 5
    When I kill the line
    Then the text is "alphabeta"
    And the newest kill is "\n"

  Scenario: An explicit prefix kills through the newline
    Given text "alpha\nbeta" at position 2
    When I kill the line with prefix 1
    Then the text is "albeta"
    And the newest kill is "pha\n"

  Scenario: Default kill includes trailing whitespace and newline
    Given text "abc  \ndef" at position 3
    When I kill the line
    Then the text is "abcdef"
    And the newest kill is "  \n"

  Scenario: Negative prefix kills into preceding lines
    Given text "abc\ndef\nghi" at position 5
    When I kill the line with prefix -1
    Then the text is "ef\nghi"
    And the newest kill is "abc\nd"
    And point is 0

  Scenario: Zero prefix at an empty first line preserves text
    Given text "\nabc" at position 0
    When I kill the line with prefix 0
    Then the text is "\nabc"
    And point is 0

  Scenario: An empty kill starts a new entry and the next kill appends
    Given text "abc\ndef" at position 0
    When I add an older kill "older"
    And I kill the line with prefix 0
    Then the kill ring contains "" then "older"
    When I kill the line
    Then the kill ring contains "abc" then "older"
    When I yank
    Then the text is "abc\ndef"

  Scenario: Default kill before CRLF preserves the newline and yanks
    Given text "alpha\r\nbeta" at position 2
    When I kill the line
    Then the text is "al\r\nbeta"
    And the newest kill is "pha"
    When I yank
    Then the text is "alpha\r\nbeta"

  Scenario: Consecutive CRLF kills retain complete line endings
    Given text "alpha\r\nbeta\r\ngamma" at position 2
    When I kill the line with prefix 1
    And I kill the line with prefix 1
    Then the text is "algamma"
    And the newest kill is "pha\r\nbeta\r\n"
    When I yank
    Then the text is "alpha\r\nbeta\r\ngamma"

  Scenario: CRLF movement stays on logical character boundaries
    Given text "a\r\nbb\r\nc" at position 0
    When I move to the end of the line
    Then point is 1
    When I move forward 1 character
    Then point is 3
    When I move backward 1 character
    Then point is 1
    When I move down 1 line
    Then point is 4

  Scenario: Kill at end of buffer reports an error
    Given text "abc" at position 3
    When I kill the line
    Then an error is reported
    And the text is "abc"

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

  Scenario Outline: Numeric prefixes select a line boundary
    Given text "aa\nbb\ncc" at position 4
    When I move to the <boundary> of the line with prefix <count>
    Then point is <point>
    And the text is "aa\nbb\ncc"
    Examples:
      | boundary  | count | point |
      | beginning | 1     | 3     |
      | end       | 1     | 5     |
      | beginning | 2     | 6     |
      | end       | 2     | 8     |
      | beginning | 0     | 0     |
      | end       | 0     | 2     |
      | beginning | -2    | 0     |
      | end       | -2    | 0     |
      | beginning | 9     | 6     |
      | end       | 9     | 8     |

  Scenario: Prefix line motion preserves CRLF boundaries
    Given text "aa\r\nbb\r\ncc" at position 5
    When I move to the end of the line with prefix 0
    Then point is 2
    When I move to the beginning of the line with prefix 2
    Then point is 4

  Scenario Outline: Move from the second line to an empty first line
    Given text "<text>" at position <start>
    When I move up 1 line
    Then point is 0
    And the text is "<text>"
    Examples:
      | text    | start |
      | \nx     | 1     |
      | \r\nx   | 2     |

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

  Scenario: A numeric yank selects an older kill and yank-pop advances
    Given text "" at position 0
    When I add an older kill "old"
    And I add an older kill "new"
    And I yank with numeric prefix 2
    Then the text is "old"
    And point is 3 and mark is 0
    When I rotate the yank
    Then the text is "new"
    And point is 3 and mark is 0

  Scenario: Universal yank and yank-pop keep point before the inserted text
    Given text "x" at position 0
    When I add an older kill "old"
    And I add an older kill "new"
    And I yank with a universal prefix
    Then the text is "newx"
    And point is 0 and mark is 3
    And the region is inactive
    When I rotate the yank
    Then the text is "oldx"
    And point is 0 and mark is 3

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

  Scenario: A failed zap preserves an active mark and the previous kill
    Given text "alpha beta" at position 0
    When I set the mark
    And I move forward 2 character
    And I add an older kill "older"
    And I zap 3 occurrences of "a"
    Then an error is reported
    And the text is "alpha beta"
    And point is 2 and mark is 0
    And the region is active
    And the newest kill is "older"
    When I exchange point and mark
    Then point is 0 and mark is 2
    And the region is active

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

  @SC-region-case-forward
  Scenario: Uppercase a marked CRLF region without moving point or mark
    Given text "one\r\ntwo" at position 0
    When I set the mark
    And I move forward 7 character
    And I upcase the active region
    Then the text is "ONE\r\nTWO"
    And point is 8 and mark is 0
    And the region is inactive

  @SC-region-case-reversed
  Scenario: Downcase a reversed region
    Given text "ONE TWO" at position 7
    When I set the mark
    And I move backward 3 character
    And I downcase the active region
    Then the text is "ONE two"
    And point is 4 and mark is 7
    And the region is inactive

  @SC-region-case-empty
  Scenario: Case conversion of an empty region preserves the active mark
    Given text "alpha" at position 2
    When I set the mark
    And I upcase the active region
    Then the text is "alpha"
    And point is 2 and mark is 2
    And the region is active

  @SC-region-case-reject
  Scenario: Case expansion is rejected without changing the region
    Given text "ß" at position 0
    When I set the mark
    And I move forward 1 character
    And I upcase the active region
    Then an error is reported
    And the text is "ß"
    And point is 1 and mark is 0
    And the region is active

  @SC-transpose-lines-forward
  Scenario: Transpose lines across CRLF and retain an inactive mark
    Given text "one\r\ntwo\r\nthree" at position 5
    When I set the mark
    And I transpose lines with count 1
    Then the text is "two\r\none\r\nthree"
    And point is 10
    And the region is inactive

  @SC-transpose-lines-negative
  Scenario: Move a previous line backward with a negative count
    Given text "one\ntwo\nthree\n" at position 14
    When I transpose lines with count -2
    Then the text is "three\none\ntwo\n"
    And point is 6

  @SC-transpose-lines-zero
  Scenario: A zero prefix exchanges lines at point and mark
    Given text "one\r\ntwo\r\nthree" at position 0
    When I set the mark
    And I move forward 10 character
    And I transpose lines with count 0
    Then the text is "three\r\ntwo\r\none\r\n"
    And point is 0 and mark is 17
    And the region is inactive

  @SC-transpose-lines-error
  Scenario: An invalid transpose leaves the buffer unchanged
    Given text "one\ntwo\n" at position 0
    When I transpose lines with count -1
    Then an error is reported
    And the text is "one\ntwo\n"
    And point is 0

  @SC-transpose-words
  Scenario: Transpose two words and preserve punctuation
    Given text "one, two three" at position 3
    When I transpose words with count 1
    Then the text is "two, one three"
    And point is 8

  @SC-transpose-words-negative
  Scenario: Move a word backward with a negative prefix
    Given text "one two three" at position 9
    When I transpose words with count -2
    Then the text is "three one two"
    And point is 5

  @SC-transpose-words-zero
  Scenario: Transpose the words around point and mark
    Given text "one two three" at position 13
    When I set the mark
    And I move backward 13 character
    And I transpose words with count 0
    Then the text is "three two one"
    And point is 13 and mark is 0
    And the region is inactive

  Scenario: Transpose adjacent characters
    Given text "abcd" at position 2
    When I transpose characters with count 1
    Then the text is "acbd"
    And point is 3

  @SC-transpose-mark
  Scenario: Counted transpose moves the mark and deactivates the region
    Given text "abcdef" at position 3
    When I set the mark
    And I transpose characters with count 2
    Then the text is "abdecf"
    And point is 5 and mark is 4
    And the region is inactive

  @SC-transpose-zero-mark
  Scenario: Zero transpose exchanges point and mark and deactivates the region
    Given text "abcdef" at position 1
    When I set the mark
    And I move forward 2 character
    And I transpose characters with count 0
    Then the text is "adcbef"
    And point is 1 and mark is 3
    And the region is inactive

  @SC-transpose-unicode-mark
  Scenario: Negative transpose preserves a mark around a supplementary character
    Given text "a😀bcde" at position 0
    When I set the mark
    And I move forward 3 character
    And I transpose characters with count -1
    Then the text is "ab😀cde"
    And point is 2 and mark is 0
    And the region is inactive

  @SC-transpose-crlf-mark
  Scenario: Counted transpose moves a CRLF without splitting it
    Given text "a😀\r\nbcd" at position 0
    When I set the mark
    And I move forward 3 character
    And I transpose characters with count 2
    Then the text is "a😀bc\r\nd"
    And point is 7 and mark is 0
    And the region is inactive

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

  @SC-delete-indentation
  Scenario: Join the current line to the preceding line
    Given text "one  \n  two" at position 8
    When I join lines with prefix 0
    Then the text is "one two"
    And point is 3

  @SC-delete-indentation-prefix
  Scenario: A prefix joins the following line across CRLF
    Given text "one\r\n  two" at position 1
    When I join lines with prefix 1
    Then the text is "one two"
    And point is 3

  @SC-delete-indentation-region
  Scenario: Join all lines in an active region
    Given text "one\ntwo\nthree" at position 0
    When I set the mark
    And I move forward 13 character
    And I join lines with prefix 0
    Then the text is "one two three"
    And point is 3
    And the region is inactive

  @SC-delete-blank-lines
  Scenario: Delete blank lines following a nonblank line
    Given text "one\n\n\ntwo" at position 1
    When I delete blank lines
    Then the text is "one\ntwo"
    And point is 1

  @SC-delete-blank-lines-current
  Scenario: Collapse a group of blank lines around point
    Given text "one\n\n\ntwo" at position 4
    When I delete blank lines
    Then the text is "one\n\ntwo"
    And point is 4

  @SC-delete-blank-lines-crlf
  Scenario: Delete a single CRLF blank line
    Given text "one\r\n\r\ntwo" at position 5
    When I delete blank lines
    Then the text is "one\r\ntwo"
    And point is 5

  @SC-cycle-spacing
  Scenario: Cycle spaces through one, none and original
    Given text "left   right" at position 6
    When I cycle spacing
    Then the text is "left right"
    And point is 5
    When I cycle spacing
    Then the text is "leftright"
    And point is 4
    When I cycle spacing
    Then the text is "left   right"
    And point is 6

  @SC-cycle-spacing-negative
  Scenario: Negative spacing prefix joins lines and restores CRLF
    Given text "a \r\n  b" at position 4
    When I cycle spacing with prefix -2
    Then the text is "a  b"
    And point is 3
    When I cycle spacing
    Then the text is "ab"
    When I cycle spacing
    Then the text is "a \r\n  b"
    And point is 4

  @SC-tab-stop-spaces
  Scenario: Tab to the next stop using spaces and normalize preceding whitespace
    Given text "a  b" at position 3
    When I set the mark
    And I tab to a stop of width 4 using spaces
    Then the text is "a   b"
    And point is 4 and mark is 1
    And the region is inactive

  @SC-tab-stop-tabs
  Scenario: Tab to the next stop using tabs
    Given text "abc" at position 3
    When I tab to a stop of width 4 using tabs
    Then the text is "abc\t"
    And point is 4

  @SC-tab-stop-unsupported
  Scenario: Unsupported display width leaves text and mark intact
    Given text "猫abc" at position 1
    When I set the mark
    And I tab to a stop of width 4 using spaces
    Then an error is reported
    And the text is "猫abc"
    And point is 1 and mark is 1
    And the region is active

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

  Scenario: Whitespace deletion deactivates the mark only when text changes
    Given text "a   b" at position 0
    When I set the mark
    And I move forward 2 character
    And I delete horizontal whitespace around
    Then the text is "ab"
    And point is 1 and mark is 0
    And the region is inactive
    When I exchange point and mark
    Then point is 0 and mark is 1
    And the region is active
    When I delete horizontal whitespace backward
    Then the text is "ab"
    And point is 0 and mark is 1
    And the region is active

  Scenario: Move to indentation from inside a line
    Given text "  hello" at position 5
    When I move to indentation
    Then point is 2
    When I move to indentation
    Then point is 2

  Scenario: Indentation respects Unicode space syntax while retaining the mark
    Given text "  hello" at position 7
    When I set the mark
    And I move to indentation
    Then point is 2 and mark is 7
    And the region is active
    And the text is "  hello"

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

  @SC-comment-dwim-trailing @global-a8886433f140e8b4
  Scenario: Comment dwim inserts a trailing comment on a code line
    Given text "foo();" at position 0
    When I comment or uncomment with token "//"
    Then the text is "foo();\t\t\t\t//"
    And point is 12

  Scenario: Comment dwim jumps into an existing trailing comment
    Given text "foo(); // note" at position 0
    When I comment or uncomment with token "//"
    Then point is 13

  Scenario: Comment dwim on a blank line copies the previous line's indentation
    Given text "    foo();\n" at position 11
    When I comment or uncomment with token "//"
    Then the text is "    foo();\n    // "
    And point is 18

  Scenario: Comment dwim without a known comment token reports an error
    Given text "foo();" at position 0
    When I try to comment or uncomment without a comment token
    Then an error is reported
    And the text is "foo();"

  Scenario: Comment dwim comments every non-blank line of an active region at the common indentation
    Given text "foo();\n    bar();" at position 0
    When I set the mark and move forward 17 characters
    And I comment or uncomment with token "//"
    Then the text is "// foo();\n//     bar();"
    And the region is inactive

  Scenario: Comment dwim respects a reversed region ending at the next CRLF line
    Given text "foo\r\nbar" at position 5
    When I set the mark
    And I move backward 4 character
    And I comment or uncomment with token "//"
    Then the text is "// foo\r\nbar"
    And point is 0 and mark is 8
    And the region is inactive

  Scenario: Comment dwim uncomments an already-commented active region
    Given text "// foo();\n// bar();" at position 0
    When I set the mark and move forward 19 characters
    And I comment or uncomment with token "//"
    Then the text is "foo();\nbar();"
    And the region is inactive

  Scenario: Comment dwim skips blank lines inside a commented region
    Given text "foo();\n\nbar();" at position 0
    When I set the mark and move forward 14 characters
    And I comment or uncomment with token "//"
    Then the text is "// foo();\n\n// bar();"

  @SC-comment-prefix-universal
  Scenario: A universal prefix kills the first comment on the current line
    Given text "// note\r\nnext" at position 3
    When I comment with token "//" and a universal prefix
    Then the text is "\r\nnext"
    And the newest kill is "// note"
    And point is 0

  @SC-comment-prefix-count
  Scenario: A numeric prefix processes successive lines and preserves their separate kills
    Given text "one // a\r\ntwo // b" at position 0
    When I comment with token "//" and prefix 2
    Then the text is "one// a\r\ntwo// b"
    And the kill ring contains " " then " "
    And point is 16

  @SC-comment-prefix-quoted-safety
  Scenario: A prefixed comment operation rejects ambiguous quoted content atomically
    Given text "ok // comment\nconst x = 'value // unchanged'" at position 0
    When I add an older kill "older"
    And I comment with token "//" and prefix 2
    Then an error is reported
    And the text is "ok // comment\nconst x = 'value // unchanged'"
    And the newest kill is "older"
    And point is 0

  @SC-comment-prefix-limit
  Scenario: An excessive prefix is rejected before inserting a comment
    Given text "   " at position 0
    When I set the mark
    And I comment with token "//" and prefix 100001
    Then an error is reported
    And the text is "   "
    And point is 0 and mark is 0
    And the region is active

  @SC-comment-region-template-safety
  Scenario: Commenting a region inside a template string is rejected atomically
    Given text "const s = `\r\n// value\r\n`;" at position 13
    When I set the mark and move forward 8 characters
    And I add an older kill "older"
    And I comment with token "//" and prefix 1
    Then an error is reported
    And the text is "const s = `\r\n// value\r\n`;"
    And point is 21 and mark is 13
    And the region is active
    And the newest kill is "older"

  @SC-comment-region-block-safety
  Scenario: A reversed region inside a block comment is preserved
    Given text "/*\n// value\n*/" at position 11
    When I set the mark
    And I move backward 8 character
    And I comment or uncomment with token "//"
    Then an error is reported
    And the text is "/*\n// value\n*/"
    And point is 3 and mark is 11
    And the region is active

  @SC-comment-prefix-region-one
  Scenario: A prefix of one comments a reversed CRLF region and preserves the mark
    Given text "foo\r\nbar" at position 8
    When I set the mark
    And I move backward 7 character
    And I comment with token "//" and prefix 1
    Then the text is "// foo\r\n// bar"
    And point is 0 and mark is 14
    And the region is inactive

  @SC-comment-prefix-region-two
  Scenario: Prefix two adds an extra delimiter to each selected line
    Given text "foo\r\nbar" at position 0
    When I set the mark and move forward 7 characters
    And I comment with token "//" and prefix 2
    Then the text is "/// foo\r\n/// bar"
    And point is 16 and mark is 0
    And the region is inactive

  @SC-comment-prefix-region-uncomment
  Scenario: Prefix one removes one extra delimiter from commented lines
    Given text "/// foo\n/// bar" at position 0
    When I set the mark and move forward 15 characters
    And I comment with token "//" and prefix 1
    Then the text is "// foo\n// bar"
    And point is 13 and mark is 0
    And the region is inactive

  @SC-comment-prefix-region-safety
  Scenario: An unsupported region prefix is rejected without modifying text or the mark
    Given text "foo\nbar" at position 0
    When I set the mark and move forward 3 characters
    And I comment with token "//" and prefix 3
    Then an error is reported
    And the text is "foo\nbar"
    And point is 3 and mark is 0
    And the region is active

  Scenario: Comment dwim on an empty active region behaves like no region
    Given text "foo();" at position 3
    When I set the mark
    And I comment or uncomment with token "//"
    Then point is 12
    And the region is inactive
