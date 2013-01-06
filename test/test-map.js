// Copyright (c) 2013, Benjamin J. Kelly ("Author")
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

'use strict';

var Map = require('../lib/map');

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

module.exports.testEvents = function(test) {
  test.expect(15);

  var map = new Map({enableTimeouts: false});

  var name = 'FOOBAR';
  var suffix = 0x20;
  var group = false;
  var address = '127.0.0.1';
  var ttl = 53;
  var type = 'broadcast';

  var validate = function(node) {
    test.ok(node);
    test.equal(node.name, name);
    test.equal(node.suffix, suffix);
    test.equal(node.address, address);
    test.equal(node.group, group);
    test.equal(node.type, type);
    test.equal(node.ttl, ttl);
  };

  var added = false;

  map.on('added', function(node) {
    added = true;
    validate(node);
  });

  map.on('removed', function(node) {
    test.ok(added);
    validate(node);
    test.done();
  });

  map.add(name, suffix, group, address, ttl, type);
  map.remove(name, suffix);
};
