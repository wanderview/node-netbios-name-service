'use strict';

var Broadcast = require('../lib/broadcast');
var Map = require('../lib/map');

module.exports.testBroadcast = function(test) {
  test.expect(1);
  var mode = new Broadcast({
    broadcastFunc: function(msg) {},
    unicastFunc: function(address, msg) {},
    transactionIdFunc: function() {},
    localMap: new Map(),
    remoteMap: new Map()
  });
  test.ok(mode instanceof Broadcast);
  test.done();
}
