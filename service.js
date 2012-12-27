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
var util = require('util');

util.inherits(NetbiosNameService, EventEmitter);

function NetbiosNameService(options) {
  var self = this instanceof NetbiosNameService
           ? this
           : Object.create(NetbiosNameService.prototype);

  options = options || {};

  self._tcpDisable = options.tcpDisable;
  if (!self._tcpDisable) {
    self._tcpPort = options.tcpPort || 137;
    self._tcpAddress = options.tcpAddress;
    self._tcpServer = options.tcpServer;
  }

  self._udpDisable = options.udpDisable;
  if (!self._udpDisable) {
    self._udpPort = options.udpPort || 137;
    self._udpAddress = options.udpAddress;
    self._udpSocket = options.udpSocket;
  }

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

NetbiosNameService.prototype._startUdp = function(callback) {
  if (!this._udpDisable) {
    var needBind = false;
    if (!this._udpSocket) {
      this._udpSocket = dgram.createSocket('udp4');
      needBind = true;
    }

    this._udpSocket.on('error', this.emit.bind(this, 'error'));
    this._udpSocket.on('message', this._onUdpMsg.bind(this));

    if (needBind) {
      this._udpSocket.on('listening', callback);
      this._udpSocket.bind(this._udpPort, this._udpAddress);
      return;
    }
  }

  callback();
};

NetbiosNameService.prototype.stop = function(callback) {
  var self = this;
  self._stopTcp(function() {
    self._stopUdp(function() {
      if (typeof callback === 'function') {
        callback();
      }
    });
  });
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

NetbiosNameService.prototype.register = function(name, suffix, address, callback) {
};

NetbiosNameService.prototype.unregister = function(name, suffix, callback) {
};

NetbiosNameService.prototype.query = function(name, suffix, callback) {
};

NetbiosNameService.prototype._onUdpMsg = function(msg, rinfo) {
};

NetbiosNameService.prototype._onTcpConnect = function(socket) {
};
