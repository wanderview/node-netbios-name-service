'use strict';

var Broadcast = require('../lib/broadcast');
var Map = require('../lib/map');

module.exports.testRegistrationConflict = function(test) {
  test.expect(7);

  var name = 'foobar.example.com';
  var suffix = 0x20;

  var localMap = new Map({enableTimeouts: false});

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    unicastFunc: function(request) {},
    localMap: localMap,
    remoteMap: new Map({enableTimeouts: false})
  });

  addToMap(localMap, name, suffix, false);

  var request = {
    transactionId: 12345,
    op: 'registration',
    recursionDesired: true,
    questions: [
      { name: name, suffix: suffix, type: 'nb' }
    ],
    additionalRecords: [
      { name: name, suffix: suffix, type: 'nb', ttl: 3600,
        nb: { entries: [{ address: '1.1.1.1', type: 'broadcast', group: false }]}}
    ]
  };

  mode.onRegistration(request, function(msg) {
    test.ok(msg.response);
    test.equal(msg.transactionId, request.transactionId);
    test.equal(msg.op, 'registration');
    test.equal(msg.error, 'active');
    test.equal(msg.answerRecords.length, 1);
    test.equal(msg.answerRecords[0].name, name);
    test.equal(msg.answerRecords[0].suffix, suffix);
    test.done();
  });
};

module.exports.testRegistrationNoConflict = function(test) {
  test.expect(1);

  var name = 'foobar.example.com';
  var suffix = 0x20;

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    unicastFunc: function(request) {},
    localMap: new Map({enableTimeouts: false}),
    remoteMap: new Map({enableTimeouts: false})
  });

  var request = {
    transactionId: 12345,
    op: 'registration',
    recursionDesired: true,
    questions: [
      { name: name, suffix: suffix, type: 'nb', group: false }
    ],
    additionalRecords: [
      { name: name, suffix: suffix, type: 'nb', ttl: 3600,
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
  test.expect(8);

  var localMap = new Map({enableTimeouts: false});

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    unicastFunc: function(request) {},
    localMap: localMap,
    remoteMap: new Map({enableTimeouts: false})
  });

  var name = 'foobar.example.com';
  var suffix = 0x20;
  var group = false;

  addToMap(localMap, name, suffix, group);

  var request = {
    transactionId: 67890,
    op: 'query',
    recursionDesired: true,
    questions: [
      { name: name, suffix: suffix, type: 'nb', group: group }
    ]
  };

  mode.onQuery(request, function(msg) {
    test.ok(msg.response);
    test.equal(msg.transactionId, request.transactionId);
    test.equal(msg.op, 'query');
    test.ok(!msg.error);
    test.equal(msg.answerRecords.length, 1);
    test.equal(msg.answerRecords[0].name, name);
    test.equal(msg.answerRecords[0].suffix, suffix);
    test.equal(msg.answerRecords[0].type, 'nb');
    test.done();
  });
};

module.exports.testQueryNbMissing = function(test) {
  test.expect(1);

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    unicastFunc: function(request) {},
    localMap: new Map({enableTimeouts: false}),
    remoteMap: new Map({enableTimeouts: false})
  });

  var name = 'foobar.example.com';
  var suffix = 0x20;
  var group = false;

  var request = {
    transactionId: 67890,
    op: 'query',
    recursionDesired: true,
    questions: [
      { name: name, suffix: suffix, type: 'nb', group: group }
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
  test.expect(11);

  var localMap = new Map({enableTimeouts: false});

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },
    broadcastFunc: function(request) {},
    unicastFunc: function(request) {},
    localMap: localMap,
    remoteMap: new Map({enableTimeouts: false})
  });

  var names = [
    'foobar.example.com',
    'snafu.example.com',
    'foobar',
    'snafu'
  ];
  var suffix = 0x20;
  var group = false;

  names.forEach(function(name) {
    addToMap(localMap, name, suffix, group);
  });

  var request = {
    transactionId: 89012,
    op: 'query',
    recursionDesired: true,
    questions: [
      { name: names[0], suffix: suffix, type: 'nbstat', group: group }
    ]
  };

  mode.onQuery(request, function(msg) {
    test.ok(msg.response);
    test.equal(msg.transactionId, request.transactionId);
    test.equal(msg.op, 'query');
    test.ok(!msg.error);
    test.equal(msg.answerRecords.length, 1);
    var answer = msg.answerRecords[0];
    test.equal(answer.name, names[0]);
    test.equal(answer.suffix, suffix);
    test.equal(answer.type, 'nbstat');

    // we should only get the first two names because the results are filtered
    // by the requested scope ID
    test.equal(answer.nbstat.nodes.length, 2);
    var foundNames = {};
    answer.nbstat.nodes.forEach(function(node) {
      foundNames[node.name] = true;
    });
    test.ok(foundNames[names[0]]);
    test.ok(foundNames[names[1]]);

    test.done();
  });
};

module.exports.testAddNoConflict = function(test) {
  test.expect(50);

  var name = 'foobar.example.com';
  var suffix = 0x20;
  var group = false;
  var ttl = 10;
  var address = '127.0.0.1';

  var count = 0;
  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },

    // Examine packets sent when we call add() below.  We expect
    // 3 registration packets and then one refresh packet.
    broadcastFunc: function(request) {
      if (count < 3) {
        test.equal(request.op, 'registration');
      } else {
        test.equal(request.op, 'refresh');
      }
      count += 1;
      test.ok(request.broadcast);
      var q = request.questions[0];
      test.equal(q.name, name);
      test.equal(q.suffix, suffix);
      test.equal(q.type, 'nb');
      var a = request.additionalRecords[0];
      test.equal(a.name, name);
      test.equal(a.suffix, suffix);
      test.equal(a.ttl, ttl);
      test.equal(a.type, 'nb');
      test.equal(a.nb.entries[0].address, address);
      test.equal(a.nb.entries[0].group, group);
      test.equal(a.nb.entries[0].type, 'broadcast');
    },

    unicastFunc: function(request) {},
    localMap: new Map({enableTimeouts: false}),
    remoteMap: new Map({enableTimeouts: false})
  });

  mode.add({
    name: name,
    suffix: suffix,
    group: group,
    ttl: ttl,
    address: address
  }, function(success, conflictAddress) {
    test.ok(success);
    test.ok(!conflictAddress);
    test.done();
  });
};

module.exports.testAddConflict = function(test) {
  test.expect(3);

  var name = 'foobar.example.com';
  var suffix = 0x20;
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
    broadcastFunc: function(request) {
      count += 1;
      mode.onResponse({
        transactionId: request.transactionId,
        op: 'registration',
        response: true,
        error: 'active',
        authoritative: true,
        questions: request.questions,
        answerRecords: [{
          name: name,
          suffix: suffix,
          ttl: 60,
          nb: { entries: [{
            address: remoteAddress,
            type: 'broadcast',
            group: false
          }]}
        }]
      });
    },

    unicastFunc: function(request) {},
    localMap: new Map({enableTimeouts: false}),
    remoteMap: new Map({enableTimeouts: false})
  });

  mode.add({
    name: name,
    suffix: suffix,
    group: group,
    ttl: ttl,
    address: address
  }, function(success, conflictAddress) {
    test.ok(!success);
    test.equal(conflictAddress, remoteAddress);
    test.equal(count, 1);
    test.done();
  });
};

module.exports.testRemove = function(test) {
  test.expect(37);

  var name = 'SNAFU';
  var suffix = 0x10;
  var group = false;

  var localMap = new Map({enableTimeouts: false});

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },

    // We should see 3 release packets sent
    broadcastFunc: function(request) {
      test.equal(request.op, 'release');
      test.ok(request.broadcast);
      var q = request.questions[0];
      test.equal(q.name, name);
      test.equal(q.suffix, suffix);
      test.equal(q.type, 'nb');
      var a = request.additionalRecords[0];
      test.equal(a.name, name);
      test.equal(a.suffix, suffix);
      test.equal(a.ttl, 10);
      test.equal(a.type, 'nb');
      test.equal(a.nb.entries[0].address, '127.0.0.1');
      test.equal(a.nb.entries[0].group, group);
      test.equal(a.nb.entries[0].type, 'broadcast');
    },

    unicastFunc: function(request) {},
    localMap: localMap,
    remoteMap: new Map({enableTimeouts: false})
  });

  addToMap(localMap, name, suffix, group);

  mode.remove({ name: name, suffix: suffix }, function() {
    test.ok(!localMap.contains(name, suffix));
    test.done();
  });
};

module.exports.testFind = function(test) {
  test.expect(13);

  var name = 'VMWINXP';
  var suffix = 0x20;

  var remoteMap = new Map({enableTimeouts: false});

  var remoteAddress = '10.10.10.10';

  var mode = new Broadcast({
    transactionIdFunc: function() { return 1234 },

    // We should see a query sent via broadcast.  Respond with the answer.
    broadcastFunc: function(request) {
      test.equal(request.op, 'query');
      test.ok(request.broadcast);
      var q = request.questions[0];
      test.equal(q.name, name);
      test.equal(q.suffix, suffix);
      test.equal(q.type, 'nb');

      mode.onResponse({
        transactionId: request.transactionId,
        op: 'query',
        response: true,
        authoritative: true,
        questions: request.questions,
        answerRecords: [{
          name: name,
          suffix: suffix,
          ttl: 3600,
          type: 'nb',
          nb: { entries: [{
            address: remoteAddress,
            group: false,
            type: 'broadcast'
          }]}
        }]
      });
    },

    // We should get one status request unicast after we return the
    // initial answer above.  Respond with the status info to complete
    // the find operation.
    unicastFunc: function(address, request) {
      test.equal(address, remoteAddress);

      test.equal(request.op, 'query');
      test.ok(!request.broadcast);
      var q = request.questions[0];
      test.equal(q.name, name);
      test.equal(q.suffix, suffix);
      test.equal(q.type, 'nbstat');

      mode.onResponse({
        transactionId: request.transactionId,
        op: 'query',
        response: true,
        authoritative: true,
        questions: request.questions,
        answerRecords: [{
          name: name,
          suffix: suffix,
          ttl: 3600,
          type: 'nbstat',
          nbstat: {
            unitId: '00:00:00:00:00:00',
            nodes: [{
              name: name,
              suffix: suffix,
              type: 'broadcast',
              group: false,
              active: true
            }]
          }
        }]
      });
    },

    localMap: new Map({enableTimeouts: false}),
    remoteMap: remoteMap
  });

  mode.find({name: name, suffix: suffix}, function(address) {
    test.equal(address, remoteAddress);
    test.ok(remoteMap.contains(name, suffix));
    test.done();
  });
};

function addToMap(map, name, suffix, group) {
  map.add(name, suffix, group, '127.0.0.1', 10, 'broadcast');
}
