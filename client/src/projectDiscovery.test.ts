import { expect, test } from 'vitest';
import { feedSearchParams, readFeedFilters } from './projectDiscovery';

test('discovery URLs preserve valid state and normalize invalid values', () => {
  expect(readFeedFilters(new URLSearchParams('q=+art+&sort=oldest&seeking_collaborators=true&offset=20'))).toEqual({q:'art', sort:'oldest', seekingCollaborators:true, offset:20});
  for (const query of ['q=' + 'a'.repeat(201), 'q=%00', 'q=a&q=b', 'sort=oldest&sort=newest', 'offset=-1', 'offset=1.5', 'offset=2147483648', 'offset=0&offset=1']) {
    expect(readFeedFilters(new URLSearchParams(query))).toEqual({q:'', sort:'newest', seekingCollaborators:false, offset:0});
  }
  expect(feedSearchParams(readFeedFilters(new URLSearchParams('q=art&sort=newest&offset=00020&unknown=ignored'))).toString()).toBe('q=art&offset=20');
});
