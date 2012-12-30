'use strict';

var Cache = require('../cache');

var timers = require('timers');

function setTimeout2(delay, callback) {
  timers.setTimeout(callback, delay);
}

module.exports.testCacheWithTimeout = function(test) {
  test.expect(6);
  var cache = new Cache();

  var name = 'foobar';
  var suffix = 0x20;

  test.equal(cache.get(name, suffix), null);

  var record = {
    name: name,
    suffix: suffix,
    ttl: 2,
    type: 'nb',
    nb: {
      entries: [{ address: '127.0.0.1', type: 'broadcast', group: false }]
    }
  };

  cache.update(record);

  test.notEqual(cache.get(name, suffix), null);

  setTimeout2(1100, function() {
    var cacheRecord = cache.get(name, suffix);
    test.notEqual(cacheRecord, null);
    test.equal(cacheRecord.ttl, 1);

    cache.update(record);

    cacheRecord = cache.get(name, suffix);
    test.equal(cacheRecord.ttl, 2);

    setTimeout2(2100, function() {
      cacheRecord = cache.get(name, suffix);
      test.equal(cacheRecord, null);
      test.done();
    });
  });
};

module.exports.testCacheWithoutTimeout = function(test) {
  test.expect(4);
  var cache = new Cache({enableTimeouts: false});

  var name = 'foobar.example.com';
  var suffix = 0x10;

  test.equal(cache.get(name, suffix), null);

  var record = {
    name: name,
    suffix: suffix,
    ttl: 2,
    type: 'nb',
    nb: {
      entries: [{ address: '127.0.0.1', type: 'broadcast', group: false }]
    }
  };

  cache.update(record);

  test.notEqual(cache.get(name, suffix), null);

  setTimeout2(1100, function() {
    var cacheRecord = cache.get(name, suffix);
    test.notEqual(cacheRecord, null);
    test.equal(cacheRecord.ttl, 2);

    test.done();
  });
};
