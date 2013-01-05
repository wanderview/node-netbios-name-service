'use strict';

var Broadcast = require('../broadcast');
var Map = require('../map');

module.exports.testBroadcast = function(test) {
  test.expect(1);
  var mode = new Broadcast({
    broadcastFunc: function(msg) {},
    transactionIdFunc: function() {},
    localMap: new Map(),
    remoteMap: new Map()
  });
  test.ok(mode instanceof Broadcast);
  test.done();
}
