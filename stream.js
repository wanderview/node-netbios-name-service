'use strict';

module.exports = NetbiosNameServiceStream;

var EventEmitter = require('events').EventEmitter;
var Readable = require('readable-stream');
var util = require('util');

util.inherits(NetbiosNameServiceStream, EventEmitter);

function NetbiosNameServiceStream(socket) {
  var self = (this instanceof NetbiosNameServiceStream)
           ? this
           : Object.create(NetbiosNameServiceStream.prototype);

  self._socket = socket;
  self._stream = new Readable();
  self._stream.wrap(self._socket);

  return self;
}

// Events:
//  - message

NetbiosNameServiceStream.prototype.write = function(netbiosMsg, callback) {

  // allocate max allowed length buffer for message
  //  - 2 bytes for the length and (2^16 - 1) bytes for the message
  var buf = new Buffer(2 + 65535);

  // skip 16-bit length field for now

  // write netbios message

  // write 16-bit length field now that we know the message size
};

NetbiosNameServiceStream.prototype._read = function() {
  // read 16-bit length field

  // read the specified number of bytes

  // unpack the netbios message

  // emit the netbios message
};
