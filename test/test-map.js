'use strict';

var Map = require('../map');

var timers = require('timers');

function setTimeout2(delay, callback) {
  timers.setTimeout(callback, delay);
}

module.exports.testMapWithTimeout = function(test) {
  test.expect(6);
  var map = new Map();
  map.on('timeout', function(name, suffix) {
    map.remove(name, suffix);
  });

  var name = 'foobar';
  var suffix = 0x20;

  test.equal(map.getNb(name, suffix), null);

  var record = {
    name: name,
    suffix: suffix,
    ttl: 2,
    type: 'nb',
    nb: {
      entries: [{ address: '127.0.0.1', type: 'broadcast', group: false }]
    }
  };

  map.update(record);

  test.notEqual(map.getNb(name, suffix), null);

  setTimeout2(1100, function() {
    var mapRecord = map.getNb(name, suffix);
    test.notEqual(mapRecord, null);
    test.equal(mapRecord.ttl, 1);

    map.update(record);

    mapRecord = map.getNb(name, suffix);
    test.equal(mapRecord.ttl, 2);

    setTimeout2(2100, function() {
      mapRecord = map.getNb(name, suffix);
      test.equal(mapRecord, null);

      map.clear();
      test.done();
    });
  });
};

module.exports.testMapWithoutTimeout = function(test) {
  test.expect(4);
  var map = new Map({enableTimeouts: false});
  map.on('timeout', function(name, suffix) {
    map.remove(name, suffix);
  });

  var name = 'foobar.example.com';
  var suffix = 0x10;

  test.equal(map.getNb(name, suffix), null);

  map.add(name, suffix, false, '127.0.0.1', 2, 'broadcast');

  test.notEqual(map.getNb(name, suffix), null);

  setTimeout2(1100, function() {
    var mapRecord = map.getNb(name, suffix);
    test.notEqual(mapRecord, null);
    test.equal(mapRecord.ttl, 2);

    map.clear();
    test.done();
  });
};

module.exports.testGetNbstat = function(test) {
  test.expect(4);
  var map = new Map();

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
  map.update(record1);

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
  map.update(record2);

  var nbstat1 = map.getNbstat('arg.example.com', suffix);
  test.equal(nbstat1.nbstat.nodes.length, 1);
  test.equal(nbstat1.nbstat.nodes[0].name, name1);

  var nbstat2 = map.getNbstat('hmm', suffix);
  test.equal(nbstat2.nbstat.nodes.length, 1);
  test.equal(nbstat2.nbstat.nodes[0].name, name2);

  map.clear();

  test.done();
};
