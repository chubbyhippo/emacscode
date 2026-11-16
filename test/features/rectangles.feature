Feature: Rectangle operations
  Scenario: Kill a rectangular region
    Given rectangle text "abcde\nfghij\nklmno" with mark 2 and point 9
    When I perform rectangle "kill"
    Then rectangle text is "abde\nfgij\nklmno"
    And rectangle rows are "c|h"
    And rectangle point is 2

  Scenario: Reversed corners identify the same rectangle
    Given rectangle text "abcde\nfghij\nklmno" with mark 9 and point 2
    When I perform rectangle "copy"
    Then rectangle rows are "c|h"
    And rectangle text is "abcde\nfghij\nklmno"

  Scenario: Opening a rectangle inserts spaces
    Given rectangle text "abcde\nfghij\nklmno" with mark 2 and point 9
    When I perform rectangle "open"
    Then rectangle text is "ab cde\nfg hij\nklmno"

  Scenario: Clearing a rectangle inserts spaces
    Given rectangle text "abcde\nfghij\nklmno" with mark 2 and point 9
    When I perform rectangle "clear"
    Then rectangle text is "ab de\nfg ij\nklmno"

  Scenario: Yanking extends short lines and creates missing lines
    Given rectangle text "ab\nx" with mark 0 and point 2
    When I yank rectangle rows "XY|ZZ|Q"
    Then rectangle text is "abXY\nx ZZ\n  Q"
    And rectangle point is 13

  Scenario: Unsupported tabs fail without modifying text
    Given rectangle text "a\tbc\ndefg" with mark 0 and point 6
    When I try rectangle "delete"
    Then a rectangle error is reported
    And the original rectangle text is "a\tbc\ndefg"

  Scenario: Short lines are padded when copying a rectangle
    Given rectangle text "abcde\nx\nabcde" with mark 1 and point 12
    When I perform rectangle "copy"
    Then rectangle rows are "bcd|   |bcd"
    And rectangle text is "abcde\nx\nabcde"

  Scenario: Opening a rectangle leaves short lines unchanged
    Given rectangle text "abcde\nx\nabcde" with mark 1 and point 12
    When I perform rectangle "open"
    Then rectangle text is "a   bcde\nx\na   bcde"
