'use strict';

var Broadcast = require('../broadcast');

module.exports.testBroadcast = function(test) {
  test.expect(1);
  var mode = new Broadcast({broadcastFunc: function(msg) {}});
  test.ok(mode instanceof Broadcast);
  test.done();
}
