import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBoardFilters,hasBoardFilters,taskMatchesFilters,ownerKey} from '../src/board/filters.js';
const task={id:'one',owner:'Мария',releaseId:'release-one',tagIds:['android','ui']};
test('B2 board fields combine with AND while values within a field use OR',()=>{
  const filters=normalizeBoardFilters({owners:[ownerKey(task),'none'],releases:['release-one'],tags:['android']});
  assert.equal(taskMatchesFilters(task,filters),true);
  assert.equal(taskMatchesFilters({...task,releaseId:'release-two'},filters),false);
});
test('B2 tag filter provides explicit any and all semantics',()=>{
  assert.equal(taskMatchesFilters(task,normalizeBoardFilters({tags:['android','missing'],tagMode:'any'})),true);
  assert.equal(taskMatchesFilters(task,normalizeBoardFilters({tags:['android','missing'],tagMode:'all'})),false);
  assert.equal(taskMatchesFilters(task,normalizeBoardFilters({tags:['android','ui'],tagMode:'all'})),true);
});
test('B2 unassigned and no-release choices are actual filter values',()=>{
  const filters=normalizeBoardFilters({owners:['none'],releases:['none']});
  assert.equal(taskMatchesFilters({id:'empty'},filters),true);assert.equal(taskMatchesFilters(task,filters),false);
});
test('B2 clearing every field restores an unfiltered predicate',()=>{
  const filters=normalizeBoardFilters();assert.equal(hasBoardFilters(filters),false);assert.equal(taskMatchesFilters(task,filters),true);
  assert.deepEqual(normalizeBoardFilters({tags:['ui','ui',null]}).tags,['ui']);
});
