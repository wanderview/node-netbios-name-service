'use strict';

var Message = require('../lib/message');

module.exports.testMessage = function(test) {
  test.expect(1);
  var msg = new Message();
  test.ok(msg instanceof Message);
  test.done();
};
