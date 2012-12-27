'user strict';

var EventEmitter = require('events').EventEmitter;
var NetbiosNameService = require('../service');

module.exports.testService = function(test) {
  test.expect(2);
  var service = new NetbiosNameService({tcpPort: 11137, udpPort: 11137});
  service.on('error', function(error) {
    console.log(error);
    throw(error);
  });
  test.ok(service instanceof NetbiosNameService);
  test.ok(service instanceof EventEmitter);
  service.start(function() {
    service.stop(function() {
      test.done();
    });
  });
};
