// Unit tests: name rules (trim and length only; no character whitelist). No database needed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { nameProblem, cleanName, NAME_MAX } from '../src/names.js'

test('names with spaces, hyphens, apostrophes and accented letters are accepted', () => {
  for (const n of ["Zoë-Anne O'Neill", 'José Müller', 'Ngũgĩ wa Thiong’o', 'Åsa Øberg-Ñúñez', 'Mary Jane Wanjiru', 'Đặng Thị Hồng', 'X'])
    assert.equal(nameProblem(n), '', n)
})

test('names are trimmed, and blank or missing names are rejected', () => {
  assert.equal(cleanName('  Amina Yusuf  '), 'Amina Yusuf')
  for (const n of ['', '   ', '\t\n', undefined, null, 42, ['A']]) assert.equal(nameProblem(n), 'Name is required.', String(n))
})

test('the length limit counts characters, after trimming', () => {
  assert.equal(nameProblem('é'.repeat(NAME_MAX)), '')
  assert.equal(nameProblem(`  ${'a'.repeat(NAME_MAX)}  `), '')
  assert.match(nameProblem('a'.repeat(NAME_MAX + 1)), /100 characters or fewer/)
})
