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
