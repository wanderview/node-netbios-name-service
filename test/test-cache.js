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

  test.equal(cache.getNb(name, suffix), null);

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

  test.notEqual(cache.getNb(name, suffix), null);

  setTimeout2(1100, function() {
    var cacheRecord = cache.getNb(name, suffix);
    test.notEqual(cacheRecord, null);
    test.equal(cacheRecord.ttl, 1);

    cache.update(record);

    cacheRecord = cache.getNb(name, suffix);
    test.equal(cacheRecord.ttl, 2);

    setTimeout2(2100, function() {
      cacheRecord = cache.getNb(name, suffix);
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

  test.equal(cache.getNb(name, suffix), null);

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

  test.notEqual(cache.getNb(name, suffix), null);

  setTimeout2(1100, function() {
    var cacheRecord = cache.getNb(name, suffix);
    test.notEqual(cacheRecord, null);
    test.equal(cacheRecord.ttl, 2);

    test.done();
  });
};

module.exports.testCacheNbstat = function(test) {
  test.expect(4);
  var cache = new Cache();

  var suffix = 0x10;

  var name1 = 'foobar.example.com';
  var record1 = {
    name: name1,
    suffix: suffix,
    ttl: 2,
    type: 'nb',
    nb: {
      entries: [{ address: '127.0.0.1', type: 'broadcast', group: false }]
    }
  };
  cache.update(record1);

  var name2 = 'snafu';
  var record2 = {
    name: name2,
    suffix: suffix,
    ttl: 2,
    type: 'nb',
    nb: {
      entries: [{ address: '127.0.0.1', type: 'broadcast', group: false }]
    }
  };
  cache.update(record2);

  var nbstat1 = cache.getNbstat('arg.example.com', suffix);
  test.equal(nbstat1.nbstat.nodes.length, 1);
  test.equal(nbstat1.nbstat.nodes[0].name, name1);

  var nbstat2 = cache.getNbstat('hmm', suffix);
  test.equal(nbstat2.nbstat.nodes.length, 1);
  test.equal(nbstat2.nbstat.nodes[0].name, name2);

  test.done();
};
