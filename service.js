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

module.exports = NetbiosNameService;

var EventEmitter = require('events').EventEmitter;
var dgram = require('dgram');
var net = require('net');
var timers = require('timers');
var util = require('util');

var Broadcast = require('./broadcast');
var Map = require('./map');
var Stream = require('./stream');
var pack = require('./pack');
var unpack = require('./unpack');

var BCAST_RETRY_DELAY_MS = 250;
var BCAST_RETRY_COUNT = 3;
var CONFLICT_DELAY_MS = 1000;
var UDP_PORT = 137;

// TODO: validate packets received before referencing fields

util.inherits(NetbiosNameService, EventEmitter);

function NetbiosNameService(options) {
  var self = this instanceof NetbiosNameService
           ? this
           : Object.create(NetbiosNameService.prototype);

  EventEmitter.call(self);

  options = options || Object.create(null);

  self._tcpDisable = options.tcpDisable;
  if (!self._tcpDisable) {
    self._tcpPort = options.tcpPort || 137;
    self._tcpAddress = options.tcpAddress;
    self._tcpServer = options.tcpServer;
  }

  self._udpDisable = options.udpDisable;
  if (!self._udpDisable) {
    self._udpPort = options.udpPort || UDP_PORT;
    self._udpAddress = options.udpAddress;
    self._udpSocket = options.udpSocket;
  }

  self._cache = new Map();
  self._cache.on('timeout', function(name, suffix) {
    self._cache.remove(name, suffix);
  });
  self._cache.on('added', self.emit.bind(self, 'added'));
  self._cache.on('removed', self.emit.bind(self, 'removed'));

  self._localNames = new Map();
  self._localNames.on('timeout', function(name, suffix) {
    // TODO:  This is only done in point, mixed, and hybrid modes
    //self._sendRefresh(name, suffix);
  });
  self._localNames.on('added', self.emit.bind(self, 'added'));
  self._localNames.on('removed', self.emit.bind(self, 'removed'));

  var now = new Date();
  self._nextTransactionId = now.getTime() & 0xffff;

  self._type = 'broadcast';
  self._mode = new Broadcast({
    broadcastFunc: self._sendUdpMsg.bind(self, '255.255.255.255', UDP_PORT),
    transactionIdFunc: self._newTransactionId.bind(self)
  });

  return self;
}

// Events:
//  - register
//  - unregister

NetbiosNameService.prototype.start = function(callback) {
  var self = this;
  self._startTcp(function() {
    self._startUdp(function() {
      if (typeof callback === 'function') {
        callback();
      }
    });
  });
};

NetbiosNameService.prototype.stop = function(callback) {
  var self = this;
  self._stopTcp(function() {
    self._stopUdp(function() {
      self._cache.removeAllListeners();
      self._cache.clear();
      self._localNames.removeAllListeners();
      self._localNames.clear();
      if (typeof callback === 'function') {
        callback();
      }
    });
  });
};

NetbiosNameService.prototype.add = function(name, suffix, group, address, ttl,
                                            callback) {
  var self = this;
  if (!self._localNames.contains(name, suffix)) {
    var modeOpts = {
      name: name,
      suffix: suffix,
      group: group,
      address: address,
      ttl: ttl,
      type: self._type
    };

    self._mode.add(modeOpts, function(success, conflictAddress) {
      if (success) {
        self._localNames.add(name, suffix, group, address, ttl, self._type);
      }
      if (typeof callback === 'function') {
        callback(success, conflictAddress);
      }
    });
  }
};

NetbiosNameService.prototype.remove = function(name, suffix, callback) {
  var record = this._localNames.getNb(name, suffix);
  if (!record) {
    if (typeof callback === 'function') {
      calback();
    }
    return;
  }

  this._localNames.remove(name, suffix);
  this._mode.remove({
    name: name,
    suffix: suffix,
    record: record
  }, callback);
};

NetbiosNameService.prototype.find = function(name, suffix, callback) {
  var self = this;
  var record = self._localNames.getNb(name, suffix) ||
               self._cache.getNb(name, suffix);
  if (record) {
    if (typeof callback === 'function') {
      callback(record.nb.entries[0].address);
    }
    return;
  }

  var modeOpts = {
    name: name,
    suffix: suffix,
  };

  self._mode.find(modeOpts, function(conflict, address) {
    if (conflict) {
      self._cache.remove(name, suffix);
    } else {
      if (typeof callback === 'function') {
        callback(address);
      }
    }
  });
};

// ----------------------------------------------------------------------------
// Private methods
// ----------------------------------------------------------------------------

NetbiosNameService.prototype._startTcp = function(callback) {
  if (!this._tcpDisable) {
    var needListen = false;
    if (!this._tcpServer) {
      this._tcpServer = net.createServer();
      needListen = true;
    }

    this._tcpServer.on('error', this.emit.bind(this, 'error'));
    this._tcpServer.on('connection', this._onTcpConnect.bind(this));

    if (needListen) {
      this._tcpServer.listen(this._tcpPort, this._tcpAddress, callback);
      return;
    }
  }

  callback();
};

NetbiosNameService.prototype._stopTcp = function(callback) {
  var self = this;
  if (self._tcpServer) {
    self._tcpServer.close(function() {
      self._tcpServer = null;
      callback();
    });
    return;
  }
  callback();
};

NetbiosNameService.prototype._onTcpConnect = function(socket) {
  var self = this;
  var stream = new Stream(socket);

  // TODO: How do we handle socket teardown here?  Do we have to cleanup
  //       anything to avoid memory leaks due to stale objects?

  stream.on('error', self.emit.bind(self, 'error'));
  stream.on('message', function(msg) {
    self._onNetbiosMsg(msg, stream.write.bind(stream));
  });
};

NetbiosNameService.prototype._startUdp = function(callback) {
  var self = this;
  if (!self._udpDisable) {
    var needBind = false;
    if (!self._udpSocket) {
      self._udpSocket = dgram.createSocket('udp4');
      needBind = true;
    } else {
      self._udpSocket.setBroadcast(true);
    }

    self._udpSocket.on('error', self.emit.bind(self, 'error'));
    self._udpSocket.on('message', self._onUdpMsg.bind(self));

    if (needBind) {
      self._udpSocket.on('listening', function() {
        self._udpSocket.setBroadcast(true);
        if (typeof callback === 'function') {
          callback();
        }
      });
      self._udpSocket.bind(self._udpPort, self._udpAddress);
      return;
    }
  }

  if (typeof callback === 'function') {
    callback();
  }
};

NetbiosNameService.prototype._stopUdp = function(callback) {
  var self = this;
  if (self._udpSocket) {
    self._udpSocket.on('close', function() {
      self._udpSocket = null;
      callback();
    });
    self._udpSocket.close();
    return;
  }
  callback();
};

NetbiosNameService.prototype._onUdpMsg = function(msg, rinfo) {
  var self = this;
  unpack(msg, function(error, len, nbmsg) {
    if (error) {
      self.emit('error', error);
      return;
    }

    self._onNetbiosMsg(nbmsg, self._sendUdpMsg.bind(self, rinfo.address,
                                                    rinfo.port));
  });
};

NetbiosNameService.prototype._sendUdpMsg = function(address, port, msg) {
  var self = this;

  // create a maximum sized buffer
  //  - 576 for recommended MTU minus IP/UDP header space
  var maxSize = 576 - 20 - 8;
  var buf = new Buffer(maxSize);

  pack(buf, msg, function(error, len) {
    if (error) {
      self.emit('error', error);
      return;
    }

    self._udpSocket.send(buf, 0, len, port, address);
  });
};

NetbiosNameService.prototype._newTransactionId = function() {
  var rtn = this._nextTransactionId;

  // increment transaction ID and wrap if necessary
  this._nextTransactionId += 1;
  this._nextTransactionId &= 0xffff;

  return rtn;
};

NetbiosNameService.prototype._onNetbiosMsg = function(msg, sendFunc) {
  if (msg.response) {
    this._mode.onResponse(msg, sendFunc);
  } else {
    var modeOpts = {
      request: msg,
      sendFunc: sendFunc,
      localMap: this._localNames,
      remoteMap: this._cache
    };

    switch (msg.op) {
      case 'query':
        this._mode.onQuery(modeOpts);
        break;
      case 'registration':
        this._mode.onRegistration(modeOpts);
        break;
      case 'release':
        this._mode.onRelease(modeOpts);
        break;
      case 'wack':
        this._mode.onWack(modeOpts);
        break;
      case 'refresh':
        this._mode.onRefresh(modeOpts);
        break;
      default:
        // do nothing
        break;
    }
  }
};
