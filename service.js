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
var os = require('os');
var util = require('util');

var Broadcast = require('./lib/broadcast');
var Map = require('./lib/map');
var Stream = require('./lib/stream');
var pack = require('./lib/pack');
var unpack = require('./lib/unpack');

var TCP_PORT = 137;
var UDP_PORT = 137;

// TODO: validate packets received before referencing fields
// TODO: cleanup message structure, perhaps create Message class
// TODO: verify that group nodes work properly

util.inherits(NetbiosNameService, EventEmitter);

function NetbiosNameService(options) {
  var self = this instanceof NetbiosNameService
           ? this
           : Object.create(NetbiosNameService.prototype);

  EventEmitter.call(self);

  options = options || Object.create(null);

  self._bindAddress = options.bindAddress;
  if (self._bindAddress) {
    self._localAddress = self._bindAddress;
  } else {
    var netList = os.networkInterfaces();
    Object.keys(netList).some(function(iface) {
      return netList[iface].some(function(addr) {
        if (addr.family === 'IPv4' && !addr.internal) {
          self._localAddress = addr.address;
          return true;
        }
        return false;
      });
    });
  }

  self._tcpDisable = options.tcpDisable;
  if (!self._tcpDisable) {
    self._tcpPort = options.tcpPort || TCP_PORT;
    self._tcpServer = options.tcpServer;
  }

  self._udpPort = options.udpPort || UDP_PORT;
  self._udpSocket = options.udpSocket;

  self._defaultTtl = options.defaultTtl || 3600;

  self._remoteMap = new Map();
  self._remoteMap.on('timeout', self._remoteMap.remove.bind(self._remoteMap));
  self._remoteMap.on('added', self.emit.bind(self, 'added'));
  self._remoteMap.on('removed', self.emit.bind(self, 'removed'));

  self._localMap = new Map();
  self._localMap.on('added', self.emit.bind(self, 'added'));
  self._localMap.on('removed', self.emit.bind(self, 'removed'));

  var now = new Date();
  self._nextTransactionId = now.getTime() & 0xffff;

  var broadcastAddress = options.broadcastAddress || '255.255.255.255';

  self._type = 'broadcast';
  self._mode = new Broadcast({
    broadcastFunc: self._sendUdpMsg.bind(self, UDP_PORT, broadcastAddress),
    transactionIdFunc: self._newTransactionId.bind(self),
    localMap: self._localMap,
    remoteMap: self._remoteMap
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
      self._remoteMap.removeAllListeners();
      self._remoteMap.clear();
      self._localMap.removeAllListeners();
      self._localMap.clear();
      if (typeof callback === 'function') {
        callback();
      }
    });
  });
};

NetbiosNameService.prototype.add = function(opts, callback) {
  opts.address = opts.address || this._localAddress;
  opts.group = !!opts.group;
  opts.ttl = opts.ttl || this._defaultTtl;
  this._mode.add(opts, callback);
};

NetbiosNameService.prototype.remove = function(opts, callback) {
  this._mode.remove(opts, callback);
};

NetbiosNameService.prototype.find = function(opts, callback) {
  this._mode.find(opts, callback);
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
      this._tcpServer.listen(this._tcpPort, this._bindAddress, callback);
      return;
    }
  }

  process.nextTick(callback);
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
  process.nextTick(callback);
};

NetbiosNameService.prototype._onTcpConnect = function(socket) {
  var self = this;
  var stream = new Stream(socket);

  stream.on('error', self.emit.bind(self, 'error'));
  stream.on('message', function(msg) {
    self._onNetbiosMsg(msg, stream.write.bind(stream));
  });
};

NetbiosNameService.prototype._startUdp = function(callback) {
  var self = this;
  var needBind = false;
  if (!self._udpSocket) {
    self._udpSocket = dgram.createSocket('udp4');
    needBind = true;
  } else {
    // ensure the broadcast flag is set on the socket passed in
    self._udpSocket.setBroadcast(true);
  }

  self._udpSocket.on('error', self.emit.bind(self, 'error'));
  self._udpSocket.on('message', self._onUdpMsg.bind(self));

  if (needBind) {
    self._udpSocket.on('listening', function() {
      // The socket must be listening before we can enable the broadcast flag
      self._udpSocket.setBroadcast(true);
      callback();
    });
    self._udpSocket.bind(self._udpPort, self._bindAddress);
    return;
  }

  process.nextTick(callback);
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
  process.nextTick(callback);
};

NetbiosNameService.prototype._onUdpMsg = function(msg, rinfo) {
  var self = this;
  var res = unpack(msg);
  if (res.error) {
    // TODO: consider using a 'warning' event instead; avoid stopping service
    //       due to a malformed packet received from a remote host
    //self.emit('error', res.error);
    return;
  }

  self._onNetbiosMsg(res.message, self._sendUdpMsg.bind(self, rinfo.port,
                                                        rinfo.address));
};

NetbiosNameService.prototype._sendUdpMsg = function(port, address, msg, callback) {
  var self = this;

  // create a maximum sized buffer
  //  - 576 for recommended MTU minus IP/UDP header space
  var maxSize = 576 - 20 - 8;
  var buf = new Buffer(maxSize);

  var res = pack(buf, msg);
  if (res.error) {
    if (typeof callback === 'function') {
      process.nextTick(callback.bind(null, res.error));
    }
    // TODO: consider using a 'warning' event instead; avoid stopping service
    //self.emit('error', res.error);
    return;
  }

  self._udpSocket.send(buf, 0, res.bytesWritten, port, address, callback);
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
    switch (msg.op) {
      case 'query':
        this._mode.onQuery(msg, sendFunc);
        break;
      case 'registration':
        this._mode.onRegistration(msg, sendFunc);
        break;
      case 'release':
        this._mode.onRelease(msg, sendFunc);
        break;
      case 'wack':
        this._mode.onWack(msg, sendFunc);
        break;
      case 'refresh':
        this._mode.onRefresh(msg, sendFunc);
        break;
      default:
        // do nothing
        break;
    }
  }
};
