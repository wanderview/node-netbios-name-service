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
