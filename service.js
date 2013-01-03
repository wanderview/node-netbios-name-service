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

var Cache = require('./cache');
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

  self._cache = new Cache();
  self._cache.on('timeout', function(name, suffix) {
    self._cache.remove(name, suffix);
  });
  self._cache.on('added', self.emit.bind(self, 'added'));
  self._cache.on('removed', self.emit.bind(self, 'removed'));

  self._localNames = new Cache();
  self._localNames.on('timeout', function(name, suffix) {
    self._sendRefresh(name, suffix);
  });
  self._localNames.on('added', self.emit.bind(self, 'added'));
  self._localNames.on('removed', self.emit.bind(self, 'removed'));

  self._responseHandlers = Object.create(null);

  self._type = 'broadcast';

  var now = new Date();
  self._nextTransactionId = now.getTime() & 0xffff;

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

NetbiosNameService.prototype.add = function(name, suffix, group, address, ttl,
                                            callback) {
  var self = this;
  if (!self._localNames.contains(name, suffix)) {
    var transactionId = self._newTransactionId();

    var request = {
      transactionId: transactionId,
      op: 'registration',
      broadcast: true,
      authoritative: true,
      recursionDesired: true,
      questions: [{name: name, suffix: suffix, type: 'nb', group: group}],
      additionalRecords: [{
        name: name, suffix: suffix, type: 'nb', ttl: ttl,
        nb: { entries: [{address: address, type: self._type, group: group}] }
      }]
    };

    self._responseHandlers[transactionId] = {
      count: 0,
      timerId: null,
      responseFunc: function(response) {
        delete self._responseHandlers[transactionId];
        if (typeof callback === 'function') {
          // negative response
          if (response.error) {
            var owner = response.answerRecords[0].nb.entries[0].address;
            callback(false, owner);

          // positive response
          } else {
            // ignore as this should not happen for 'broadcast' nodes
          }
        }
      },
      noResponseFunc: function() {
        delete self._responseHandlers[transactionId];
        self._localNames.add(name, suffix, group, address, ttl, self._type);
        self._sendRefresh(name, suffix);
        if (typeof callback === 'function') {
          callback(true);
        }
      }
    };

    self._sendRequest('255.255.255.255', UDP_PORT, request);
  }
};

NetbiosNameService.prototype._sendRefresh = function(name, suffix) {
  var record = this._localNames.getNb(name, suffix);
  if (!record) {
    return;
  }

  var transactionId = this._newTransactionId();
  var request = {
    transactionId: transactionId,
    op: 'refresh',
    authoritative: true,
    broadcast: true,
    recursionDesired: true,
    questions: [ {name: name, suffix: suffix, type: 'nb',
                  group: record.nb.entries[0].group} ],
    additionalRecords: [ record ]
  };

  // This is a one-shot send, so no need for response handlers
  delete this._responseHandlers[transactionId];

  this._sendRequest('255.255.255.255', UDP_PORT, request);
};

NetbiosNameService.prototype._newTransactionId = function() {
  var rtn = this._nextTransactionId;

  // increment transaction ID and wrap if necessary
  this._nextTransactionId += 1;
  this._nextTransactionId &= 0xffff;

  return rtn;
};

NetbiosNameService.prototype._sendRequest = function(address, port, request) {
  // TODO: support TCP server instead of UDP broadcast
  this._sendUdpMsg(address, port, request);

  var handler = this._responseHandlers[request.transactionId];
  if (handler) {
    handler.timerId = null;
    handler.count += 1;

    // Schedule another packet if we have not hit the retry limit
    if (handler.count < BCAST_RETRY_COUNT) {
      var sendFunc = this._sendRequest.bind(this, address, port, request);
      handler.timerId = timers.setTimeout(sendFunc, BCAST_RETRY_DELAY_MS);

    // Otherwise send no more requests and handle the "no response" condition
    } else if (typeof handler.noResponseFunc === 'function') {
      handler.noResponseFunc();
    } else {
      delete this._responseHandlers[request.transactionId];
    }
  }
};

NetbiosNameService.prototype.remove = function(name, suffix, callback) {
  var record = this._localNames.getNb(name, suffix);
  if (record) {
    var transactionId = this._newTransactionId();
    var request = {
      transactionId: transactionId,
      op: 'release',
      authoritative: true,
      broadcast: true,
      recursionDesired: true,
      questions: [{ name: name, suffix: suffix, type: 'nb',
                    group: record.nb.entries[0].group }],
      additionalRecords: [ record ]
    };

    this._responseHandlers[transactionId] = {
      count: 0,
      timerId: null,
      responseFunc: null,
      noResponseFunc: callback
    };

    this._localNames.remove(name, suffix);
    this._sendRequest('255.255.255.255', UDP_PORT, request);
  }
};

NetbiosNameService.prototype.find = function(name, suffix, callback) {
  var self = this;
  var record = self._localName.getNb(name, suffix) ||
               self._cache.getNb(name, suffix);
  if (record) {
    if (typeof callback === 'function') {
      callback(record.nb.entries[0].address);
    }
    return;
  }

  var transactionId = self._newTransactionId();
  var request = {
    transactionId: transactionId,
    op: 'query',
    broadcast: true,
    recursionDesired: true,
    questions: [ { name: name, suffix: suffix, type: 'nb', group: false } ]
  };

  self._responseHandlers[transactionId] = {
    count: 0,
    timerId: null,
    noResponseFunc: function() {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
    responseFunc: function(response) {
      var answer = response.answerRecords[0];
      self._cache.update(answer);
      var address = answer.nb.entries[0].address;
      if (typeof callback === 'function') {
        callback(answer.nb.entries[0].address);
      }

      // If we get another response packet then there is a conflict and we
      // need to avoid treating this value as authoritative in our cache
      self._responseHandlers[transactionId].responseFunc = function(response2) {
        var address2 = answer.nb.entries[0].address;
        if (address !== address2) {
          // The RFC says to mark the name as in "conflict", but logically its
          // the same as being removed.  Just remove it for now.
          self._cache.remove(name, suffix);
        }
      };

      // We only need to check for the conflicting responses for a limited
      // time.  After that occurs, clear the response handler.
      timers.setTimeout(function() {
        delete self._responseHandlers[transactionId];
      }, CONFLICT_DELAY_MS);
    }
  };

  this._sendRequest('255.255.255.255', UDP_PORT, request);
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

NetbiosNameService.prototype._onNetbiosMsg = function(msg, sendFunc) {
  if (msg.response) {
    this._onResponse(msg, sendFunc);
  } else {
    this._onRequest(msg, sendFunc);
  }
};

NetbiosNameService.prototype._onResponse = function(msg, sendFunc) {
  // If we are expecting this response, then process it appropriately.  Ignore
  // spurious responses we are not expecting.
  var handler = this._responseHandlers[msg.transactionId];
  if (handler && typeof handler.responseFunc === 'function') {
    timers.clearTimeout(handler.timerId);
    handler.timerId = null;
    handler.responseFunc(msg, sendFunc);
  }
};

NetbiosNameService.prototype._onRequest = function(msg, sendFunc) {
  switch (msg.op) {
    case 'query':
      this._onQuery(msg, sendFunc);
      break;
    case 'registration':
      this._onRegistration(msg, sendFunc);
      break;
    case 'release':
      this._onRelease(msg, sendFunc);
      break;
    case 'wack':
      // do nothing
      break;
    case 'refresh':
      this._onRefresh(msg, sendFunc);
      break;
    default:
      // do nothing
      break;
  }
};

NetbiosNameService.prototype._onQuery = function(msg, sendFunc) {
  var q = msg.questions ? msg.questions[0] : null;
  if (!q) {
    return;
  }

  var answer = null;
  if (q.type === 'nb') {
    answer = this._localNames.getNb(q.name, q.suffix);
  } else if (q.type === 'nbstat') {
    answer = this._localNames.getNbstat(q.name, q.suffix);
  }

  if (answer) {
    var response = {
      transactionId: msg.transactionId,
      response: true,
      op: msg.op,
      authoritative: true,
      answerRecords: [answer]
    };
    sendFunc(response);
  }
};

NetbiosNameService.prototype._onRegistration = function(msg, sendFunc) {
  var rec = msg.additionalRecords ? msg.additionalRecords[0] : null;
  if (!rec) {
    return;
  }

  // Check to see if we have this name claimed.  If both the local and remote
  // names are registered as a group, then there is no conflict.
  var localRec = this._localNames.getNb(rec.name, rec.suffix);
  if (localRec &&
      (!localRec.nb.entries[0].group || !rec.nb.entries[0].group)) {

    // Send a conflict response
    var response = {
      transactionId: msg.transactionId,
      response: true,
      op: msg.op,
      authoritative: true,
      error: 'active',
      answerRecords: [localRec]
    };
    sendFunc(response);
  }
};

NetbiosNameService.prototype._onRelease = function(msg, sendFunc) {
  var rec = msg.additionalRecords[0];
  this._cache.remove(rec.name, rec.suffix);
};

NetbiosNameService.prototype._onRefresh = function(msg, sendFunc) {
  var rec = msg.additionalRecords[0];

  // To be safe, ignore refresh requests for names we think we own.  This
  // shouldn't happen in theory.
  if (!this._localNames.contains(rec.name, rec.suffix)) {
    this._cache.update(rec);
  }
};
