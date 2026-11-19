Feature: Text and number registers
  Scenario: A text register preserves copied text
    Given a fresh register collection
    When I store text "hello" in register "a"
    Then register "a" contains text "hello"

  Scenario Outline: Copying a region to a register respects the prefix
    Given a fresh register collection
    And an active register region from <mark> to <point> in "abcdef"
    When I copy the register region to "r" with deletion <delete>
    Then register "r" contains text "<copied>"
    And the register buffer is "<text>" with point <resultPoint> and mark <resultMark> inactive
    Examples:
      | mark | point | delete | copied | text   | resultPoint | resultMark |
      | 1    | 4     | false  | bcd    | abcdef | 4           | 1          |
      | 4    | 1     | true   | bcd    | aef    | 1           | 1          |
      | 4    | 4     | true   |        | abcdef | 4           | 4          |

  Scenario: A rejected register copy leaves its previous value unchanged
    Given a fresh register collection
    And I store text "old" in register "r"
    And an active register region from 1 to 4 in "abcdef"
    When I prepare but reject a register copy to "r"
    Then register "r" contains text "old"

  Scenario: A rectangle register retains its rows and rejects numeric operations
    Given a fresh register collection
    When I store rectangle rows "bc" and "gh" in register "r"
    And I try to increment register "r" by 1
    Then a register error is reported
    And register "r" contains rectangle rows "bc" and "gh"

  Scenario: A numeric register can be incremented
    Given a fresh register collection
    When I store number 4 in register "n"
    And I increment register "n" by 3
    Then register "n" contains number 7

  Scenario: Increment rejects a text register without changing it
    Given a fresh register collection
    When I store text "hello" in register "a"
    And I try to increment register "a" by 1
    Then a register error is reported
    And register "a" contains text "hello"

  Scenario: Incrementing an empty register copies the active region
    Given a fresh register collection
    And an active register region from 1 to 4 in "abcdef"
    When I run register increment for "r" with prefix 0 and no deletion
    Then register "r" contains text "bcd"
    And the register buffer is "abcdef" with point 4 and mark 1 inactive

  Scenario: A zero prefix appends the reversed region and deletes it
    Given a fresh register collection
    And I store text "old" in register "r"
    And an active register region from 4 to 1 in "abcdef"
    When I run register increment for "r" with prefix 0 and deletion
    Then register "r" contains text "oldbcd"
    And the register buffer is "aef" with point 1 and mark 1 inactive

  Scenario: A prefixed register update can be rejected before commit
    Given a fresh register collection
    And I store text "old" in register "r"
    And an active register region from 1 to 4 in "abcdef"
    When I prepare but reject register increment for "r"
    Then register "r" contains text "old"

  Scenario: An empty register cannot be read
    Given a fresh register collection
    When I try to read register "x"
    Then a register error is reported

  Scenario: Register names must contain one character
    Given a fresh register collection
    When I try to store text in register "ab"
    Then a register error is reported
