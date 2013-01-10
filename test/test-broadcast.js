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

var Broadcast = require('../lib/broadcast');
var Map = require('../lib/map');
var NBName = require('netbios-name');

module.exports.testRegistrationConflict = function(test) {
  test.expect(6);

  var nbname = new NBName({fqdn: 'foobar.example.com', suffix: 0x20});

  var localMap = new Map({enableTimeouts: false});

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    localMap: localMap,
    remoteMap: new Map({enableTimeouts: false})
  });

  addToMap(localMap, nbname, false);

  var request = {
    transactionId: 12345,
    op: 'registration',
    recursionDesired: true,
    questions: [
      { nbname: nbname, type: 'nb' }
    ],
    additionalRecords: [
      { nbname: nbname, type: 'nb', ttl: 3600,
        nb: { entries: [{ address: '1.1.1.1', type: 'broadcast', group: false }]}}
    ]
  };

  mode.onRegistration(request, function(msg) {
    test.ok(msg.response);
    test.equal(msg.transactionId, request.transactionId);
    test.equal(msg.op, 'registration');
    test.equal(msg.error, 'active');
    test.equal(msg.answerRecords.length, 1);
    test.equal(msg.answerRecords[0].nbname.toString(), nbname.toString());
    test.done();
  });
};

module.exports.testRegistrationNoConflict = function(test) {
  test.expect(1);

  var nbname = new NBName({fqdn: 'foobar.example.com', suffix: 0x20});

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    localMap: new Map({enableTimeouts: false}),
    remoteMap: new Map({enableTimeouts: false})
  });

  var request = {
    transactionId: 12345,
    op: 'registration',
    recursionDesired: true,
    questions: [
      { nbname: nbname, type: 'nb', group: false }
    ],
    additionalRecords: [
      { nbname: nbname, type: 'nb', ttl: 3600,
        nb: { entries: [{ address: '1.1.1.1', type: 'broadcast', group: false }]}}
    ]
  };

  var gotMessage = false;
  mode.onRegistration(request, function(msg) {
    gotMessage = true;
  });

  process.nextTick(function() {
    test.ok(!gotMessage);
    test.done();
  });
};

module.exports.testQueryNb = function(test) {
  test.expect(7);

  var localMap = new Map({enableTimeouts: false});

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    localMap: localMap,
    remoteMap: new Map({enableTimeouts: false})
  });

  var nbname = new NBName({fqdn: 'foobar.example.com', suffix: 0x20});
  var group = false;

  addToMap(localMap, nbname, group);

  var request = {
    transactionId: 67890,
    op: 'query',
    recursionDesired: true,
    questions: [
      { nbname: nbname, type: 'nb', group: group }
    ]
  };

  mode.onQuery(request, function(msg) {
    test.ok(msg.response);
    test.equal(msg.transactionId, request.transactionId);
    test.equal(msg.op, 'query');
    test.ok(!msg.error);
    test.equal(msg.answerRecords.length, 1);
    test.equal(msg.answerRecords[0].nbname, nbname);
    test.equal(msg.answerRecords[0].type, 'nb');
    test.done();
  });
};

module.exports.testQueryNbMissing = function(test) {
  test.expect(1);

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    localMap: new Map({enableTimeouts: false}),
    remoteMap: new Map({enableTimeouts: false})
  });

  var nbname = new NBName({fqdn: 'foobar.example.com', suffix: 0x20});
  var group = false;

  var request = {
    transactionId: 67890,
    op: 'query',
    recursionDesired: true,
    questions: [
      { nbname: nbname, type: 'nb', group: group }
    ]
  };

  var gotMsg = false;
  mode.onQuery(request, function(msg) {
    gotMsg = true;
  });

  process.nextTick(function() {
    test.ok(!gotMsg);
    test.done();
  });
};

module.exports.testQueryNbstat = function(test) {
  test.expect(10);

  var localMap = new Map({enableTimeouts: false});

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    localMap: localMap,
    remoteMap: new Map({enableTimeouts: false})
  });

  var names = [
    new NBName({fqdn: 'foobar.example.com'}),
    new NBName({fqdn: 'snafu.example.com'}),
    new NBName({fqdn: 'foobar'}),
    new NBName({fqdn: 'snafu'})
  ];
  var group = false;

  names.forEach(function(nbname) {
    addToMap(localMap, nbname, group);
  });

  var request = {
    transactionId: 89012,
    op: 'query',
    recursionDesired: true,
    questions: [
      { nbname: names[0], type: 'nbstat', group: group }
    ]
  };

  mode.onQuery(request, function(msg) {
    test.ok(msg.response);
    test.equal(msg.transactionId, request.transactionId);
    test.equal(msg.op, 'query');
    test.ok(!msg.error);
    test.equal(msg.answerRecords.length, 1);
    var answer = msg.answerRecords[0];
    test.equal(answer.nbname.toString(), names[0].toString());
    test.equal(answer.type, 'nbstat');

    // we should only get the first two names because the results are filtered
    // by the requested scope ID
    test.equal(answer.nbstat.nodes.length, 2);
    var foundNames = {};
    answer.nbstat.nodes.forEach(function(node) {
      foundNames[node.nbname.toString()] = true;
    });
    test.ok(foundNames[names[0].toString()]);
    test.ok(foundNames[names[1].toString()]);

    test.done();
  });
};

module.exports.testAddNoConflict = function(test) {
  test.expect(43);

  var nbname = new NBName({fqdn: 'foobar.example.com'});
  var group = false;
  var ttl = 10;
  var address = '127.0.0.1';

  var count = 0;
  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },

    // Examine packets sent when we call add() below.  We expect
    // 3 registration packets and then one refresh packet.
    broadcastFunc: function(request, callback) {
      if (count < 3) {
        test.equal(request.op, 'registration');
      } else {
        test.equal(request.op, 'refresh');
      }
      count += 1;
      test.ok(request.broadcast);
      var q = request.questions[0];
      test.equal(q.nbname.toString(), nbname.toString());
      test.equal(q.type, 'nb');
      var a = request.additionalRecords[0];
      test.equal(a.nbname.toString(), nbname.toString());
      test.equal(a.ttl, ttl);
      test.equal(a.type, 'nb');
      test.equal(a.nb.entries[0].address, address);
      test.equal(a.nb.entries[0].group, group);
      test.equal(a.nb.entries[0].type, 'broadcast');

      callback(null);
    },

    localMap: new Map({enableTimeouts: false}),
    remoteMap: new Map({enableTimeouts: false})
  });

  mode.add({
    nbname: nbname,
    group: group,
    ttl: ttl,
    address: address
  }, function(error, success, conflictAddress) {
    test.ok(!error);
    test.ok(success);
    test.ok(!conflictAddress);
    test.done();
  });
};

module.exports.testAddConflict = function(test) {
  test.expect(4);

  var nbname = new NBName({fqdn: 'foobar.example.com', suffix: 0x20});
  var group = false;
  var ttl = 10;
  var address = '127.0.0.1';

  var remoteAddress = '10.10.10.10';

  var count = 0;
  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },

    // Examine packets sent when we call add() below.  When we get the
    // registration packet, send back a conflict.  There should only be
    // the first request and then no more after the conflict is sent.
    broadcastFunc: function(request, callback) {
      count += 1;
      mode.onResponse({
        transactionId: request.transactionId,
        op: 'registration',
        response: true,
        error: 'active',
        authoritative: true,
        questions: request.questions,
        answerRecords: [{
          nbname: nbname,
          ttl: 60,
          nb: { entries: [{
            address: remoteAddress,
            type: 'broadcast',
            group: false
          }]}
        }]
      });
      callback(null);
    },

    localMap: new Map({enableTimeouts: false}),
    remoteMap: new Map({enableTimeouts: false})
  });

  mode.add({
    nbname: nbname,
    group: group,
    ttl: ttl,
    address: address
  }, function(error, success, conflictAddress) {
    test.ok(!error);
    test.ok(!success);
    test.equal(conflictAddress, remoteAddress);
    test.equal(count, 1);
    test.done();
  });
};

module.exports.testRemove = function(test) {
  test.expect(32);

  var nbname = new NBName({fqdn: 'SNAFU', suffix: 0x10});
  var group = false;

  var localMap = new Map({enableTimeouts: false});

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },

    // We should see 3 release packets sent
    broadcastFunc: function(request, callback) {
      test.equal(request.op, 'release');
      test.ok(request.broadcast);
      var q = request.questions[0];
      test.equal(q.nbname.toString(), nbname.toString());
      test.equal(q.type, 'nb');
      var a = request.additionalRecords[0];
      test.equal(a.nbname.toString(), nbname.toString());
      test.equal(a.ttl, 10);
      test.equal(a.type, 'nb');
      test.equal(a.nb.entries[0].address, '127.0.0.1');
      test.equal(a.nb.entries[0].group, group);
      test.equal(a.nb.entries[0].type, 'broadcast');

      callback(null);
    },

    localMap: localMap,
    remoteMap: new Map({enableTimeouts: false})
  });

  addToMap(localMap, nbname, group);

  mode.remove(nbname, function(error) {
    test.ok(!error);
    test.ok(!localMap.contains(nbname));
    test.done();
  });
};

module.exports.testFind = function(test) {
  test.expect(11);

  var nbname = new NBName({fqdn: 'VMWINXP', suffix: 0x20});

  var remoteMap = new Map({enableTimeouts: false});

  var remoteAddress = '10.10.10.10';

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },

    // We should see a query sent via broadcast.  Respond with the answer.
    broadcastFunc: function(request, callback) {
      test.equal(request.op, 'query');
      test.ok(request.broadcast);
      var q = request.questions[0];
      test.equal(q.nbname.toString(), nbname.toString());
      test.equal(q.type, 'nb');

      mode.onResponse({
        transactionId: request.transactionId,
        op: 'query',
        response: true,
        authoritative: true,
        questions: request.questions,
        answerRecords: [{
          nbname: nbname,
          ttl: 3600,
          type: 'nb',
          nb: { entries: [{
            address: remoteAddress,
            group: false,
            type: 'broadcast'
          }]}
        }]
      },

      // We should get one status request sent after we return the
      // initial answer above.  Respond with the status info to complete
      // the find operation.
      function(request2, callback2) {
        test.equal(request2.op, 'query');
        test.ok(!request2.broadcast);
        var q = request2.questions[0];
        test.equal(q.nbname.toString(), nbname.toString());
        test.equal(q.type, 'nbstat');

        mode.onResponse({
          transactionId: request2.transactionId,
          op: 'query',
          response: true,
          authoritative: true,
          questions: request2.questions,
          answerRecords: [{
            nbname: nbname,
            ttl: 3600,
            type: 'nbstat',
            nbstat: {
              unitId: '00:00:00:00:00:00',
              nodes: [{
                nbname: nbname,
                type: 'broadcast',
                group: false,
                active: true
              }]
            }
          }]
        });

        callback2(null);
      });

      callback(null);
    },


    localMap: new Map({enableTimeouts: false}),
    remoteMap: remoteMap
  });

  mode.find(nbname, function(error, address) {
    test.ok(!error);
    test.equal(address, remoteAddress);
    test.ok(remoteMap.contains(nbname));
    test.done();
  });
};

function addToMap(map, nbname, group) {
  map.add(nbname, group, '127.0.0.1', 10, 'broadcast');
}
