'use strict';

var Hybrid = require('../lib/hybrid');
var Map = require('../lib/map');

module.exports.testHybrid = function(test) {
  test.expect(1);
  var mode = new Hybrid({
    transactionIdFunc: function() {},
    localMap: new Map(),
    remoteMap: new Map()
  });
  test.ok(mode instanceof Hybrid);
  test.done();
}
