'user strict';

var EventEmitter = require('events').EventEmitter;
var Service = require('../service');

module.exports.testService = function(test) {
  test.expect(2);
  var service = new Service({tcpPort: 11137, udpPort: 11137});
  service.on('error', function(error) {
    console.log(error);
    throw(error);
  });
  test.ok(service instanceof Service);
  test.ok(service instanceof EventEmitter);
  service.start(function() {
    service.stop();
    test.done();
  });
};

module.exports.testRegistrationConflict = function(test) {
  test.expect(7);

  var name = 'foobar.example.com';
  var suffix = 0x20;

  // we are going to mock send and receive, so disable network features
  var service = new Service({ tcpDisable: true, udpDisable: true });

  addToMap(service._localMap, name, suffix, false);

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

  service._onNetbiosMsg(request, function(msg) {
    test.ok(msg.response);
    test.equal(msg.transactionId, request.transactionId);
    test.equal(msg.op, 'registration');
    test.equal(msg.error, 'active');
    test.equal(msg.answerRecords.length, 1);
    test.equal(msg.answerRecords[0].name, name);
    test.equal(msg.answerRecords[0].suffix, suffix);
    service.stop();
    test.done();
  });
};

module.exports.testRegistrationNoConflict = function(test) {
  test.expect(1);

  var name = 'foobar.example.com';
  var suffix = 0x20;

  // we are going to mock send and receive, so disable network features
  var service = new Service({ tcpDisable: true, udpDisable: true });

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
  service._onNetbiosMsg(request, function(msg) {
    gotMessage = true;
  });

  process.nextTick(function() {
    test.ok(!gotMessage);
    service.stop();
    test.done();
  });
};

module.exports.testQueryNb = function(test) {
  test.expect(8);

  var service = new Service({ tcpDisable: true, udpDisable: true });

  var name = 'foobar.example.com';
  var suffix = 0x20;
  var group = false;

  addToMap(service._localMap, name, suffix, group);

  var request = {
    transactionId: 67890,
    op: 'query',
    recursionDesired: true,
    questions: [
      { name: name, suffix: suffix, type: 'nb', group: group }
    ]
  };

  service._onNetbiosMsg(request, function(msg) {
    test.ok(msg.response);
    test.equal(msg.transactionId, request.transactionId);
    test.equal(msg.op, 'query');
    test.ok(!msg.error);
    test.equal(msg.answerRecords.length, 1);
    test.equal(msg.answerRecords[0].name, name);
    test.equal(msg.answerRecords[0].suffix, suffix);
    test.equal(msg.answerRecords[0].type, 'nb');
    service.stop();
    test.done();
  });
};

module.exports.testQueryNbMissing = function(test) {
  test.expect(1);

  var service = new Service({ tcpDisable: true, udpDisable: true });

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
  service._onNetbiosMsg(request, function(msg) {
    gotMsg = true;
  });

  process.nextTick(function() {
    test.ok(!gotMsg);
    service.stop();
    test.done();
  });
};

module.exports.testQueryNbstat = function(test) {
  test.expect(11);

  var service = new Service({ tcpDisable: true, udpDisable: true });

  var names = [
    'foobar.example.com',
    'snafu.example.com',
    'foobar',
    'snafu'
  ];
  var suffix = 0x20;
  var group = false;

  names.forEach(function(name) {
    addToMap(service._localMap, name, suffix, group);
  });

  var request = {
    transactionId: 89012,
    op: 'query',
    recursionDesired: true,
    questions: [
      { name: names[0], suffix: suffix, type: 'nbstat', group: group }
    ]
  };

  service._onNetbiosMsg(request, function(msg) {
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

    service.stop();
    test.done();
  });
};

function addToMap(map, name, suffix, group) {
  var record = {
    name: name,
    suffix: suffix,
    type: 'nb',
    ttl: 10,
    nb: {
      entries: [{ address: '127.0.0.1', type: 'broadcast', group: group }]
    }
  };

  map.update(record);
}
