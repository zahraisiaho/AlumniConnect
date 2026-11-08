import test from 'node:test'
import assert from 'node:assert/strict'
import { roleFor } from '../src/roles.js'

const now = new Date(2026, 5, 15)

test('Graduated before this calendar year is an alumnus', () => {
  assert.equal(roleFor(2025, now), 'alumnus')
  assert.equal(roleFor(1980, now), 'alumnus')
})

test('Graduating this year or later is a student', () => {
  assert.equal(roleFor(2026, now), 'student')
  assert.equal(roleFor(2027, now), 'student')
  assert.equal(roleFor(2040, now), 'student')
})

test('The rule turns over on 1 January, not on a graduation date', () => {
  assert.equal(roleFor(2025, new Date(2025, 11, 31, 23, 59)), 'student')
  assert.equal(roleFor(2025, new Date(2026, 0, 1, 0, 0)), 'alumnus')
})
