'use strict';

var Point = require('../point');
var Map = require('../map');

module.exports.testPoint = function(test) {
  test.expect(1);
  var mode = new Point({
    transactionIdFunc: function() {},
    localMap: new Map(),
    remoteMap: new Map()
  });
  test.ok(mode instanceof Point);
  test.done();
}
