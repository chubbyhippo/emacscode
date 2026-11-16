Feature: Text and number registers
  Scenario: A text register preserves copied text
    Given a fresh register collection
    When I store text "hello" in register "a"
    Then register "a" contains text "hello"

  Scenario: An unset number can be incremented
    Given a fresh register collection
    When I increment register "n" by 3
    Then register "n" contains number 3

  Scenario: Increment rejects a text register without changing it
    Given a fresh register collection
    When I store text "hello" in register "a"
    And I try to increment register "a" by 1
    Then a register error is reported
    And register "a" contains text "hello"

  Scenario: An empty register cannot be read
    Given a fresh register collection
    When I try to read register "x"
    Then a register error is reported

  Scenario: Register names must contain one character
    Given a fresh register collection
    When I try to store text in register "ab"
    Then a register error is reported
