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
    service.stop(function() {
      test.done();
    });
  });
};

module.exports.testRegistrationConflict = function(test) {
  test.expect(6);

  var name = 'foobar.example.com';
  var suffix = 0x20;

  // we are going to mock send and receive, so disable network features
  var service = new Service({ tcpDisable: true, udpDisable: true });

  var record = {
    name: name,
    suffix: suffix,
    type: 'nb',
    nb: {
      entries: [{ address: '127.0.0.1', type: 'broadcast', group: false }]
    }
  };

  service._localNames.update(record);

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
    test.done();
  });
};
