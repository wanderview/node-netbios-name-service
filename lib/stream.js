// Copyright (c) 2013, Benjamin J. Kelly ("Author")
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

'use strict';

module.exports = NetbiosNameServiceStream;

var pack = require('../pack');
var unpack = require('../unpack');

var EventEmitter = require('events').EventEmitter;
var Readable = require('readable-stream');
var util = require('util');

util.inherits(NetbiosNameServiceStream, EventEmitter);

function NetbiosNameServiceStream(socket) {
  var self = (this instanceof NetbiosNameServiceStream)
           ? this
           : Object.create(NetbiosNameServiceStream.prototype);

  EventEmitter.call(self);

  self._socket = socket;
  self._socket.on('drain', self.emit.bind('drain'));

  self._stream = new Readable();
  self._stream.wrap(self._socket);
  self._stream.on('end', self.emit.bind(self, 'end'));

  self._length = null;
  self._readFunc = self._readLength.bind(self);

  return self;
}

NetbiosNameServiceStream.prototype.start = function() {
  this._read();
};

NetbiosNameServiceStream.prototype.destroy = function() {
  this._socket.destroy();
};

NetbiosNameServiceStream.prototype.write = function(netbiosMsg, callback) {
  var self = this;

  // allocate max allowed length buffer for message:
  //  - 2 bytes for the 16-bit length field
  //  - 65535 bytes repreenting the maximum allowed message length
  var buf = new Buffer(2 + 65535);

  var result = false;

  // pack the netbios message into the buffer skipping the first two
  // bytes to leave room for the length
  pack(buf.slice(2), netbiosMsg, function(error, len) {
    if (error) {
      self.emit('error', error);
      return;
    }

    // pack 16-bit length field now that we know the message size
    buf.writeUInt16BE(len, 0);

    // Return the write result back to communicate back pressure to our
    // caller.  The socket 'drain' events are already forwarded to our emitted
    // 'drain' event in the constructor.
    result = self._socket.write(buf.slice(0, 2 + len), null, callback);
  });

  return result;
};

NetbiosNameServiceStream.prototype._read = function() {
  // drain all data from input stream
  while (this._readFunc());

  this._stream.once('readable', this._read.bind(this));
};

NetbiosNameServiceStream.prototype._readLength = function() {
  var buf = this._stream.read(2);

  if (buf) {
    this._length = buf.readUInt16BE(0);
    this._readFunc = this._readMessage.bind(this);

    return true;
  }

  return false;
};

NetbiosNameServiceStream.prototype._readMessage = function() {
  var self = this;
  var buf = self._stream.read(self._length);
  if (buf) {
    self._length = null;
    self._readFunc = self._readLength.bind(self);

    unpack(buf, function(error, len, msg) {
      if (error) {
        self.emit('error', error);
        return;
      }

      self.emit('message', msg);
    });

    return true;
  }
};
