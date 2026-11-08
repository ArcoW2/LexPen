'use strict';
// The compare's differences (compare.js), away from the page so typing never waits: diff.js does the work.
// In: { id, a, b, opts, ties } (a, b: the lines of the two texts). Out: { id, hunks }.
importScripts('diff.js');

onmessage = ({ data: { id, a, b, opts, ties } }) => postMessage({ id, hunks: compareLines(a, b, opts, ties) });
