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

module.exports = NetbiosBroadcastMode;

var BCAST_RETRY_DELAY_MS = 250;
var BCAST_RETRY_COUNT = 3;
var CONFLICT_DELAY_MS = 1000;

function NetbiosBroadcastMode(opts) {
  var self = (this instanceof NetbiosBroadcastMode)
           ? this
           : Object.create(NetbiosBroadcastMode.prototype);

  if (typeof opts.transactionIdFunc !== 'function') {
    throw new Error('NetbiosBroadcastMode() requires a transaction ID ' +
                    'creation function');
  } else if (typeof opts.broadcastFunc !== 'function') {
    throw new Error('NetbiosBroadcastMode() requires a broadcast function');
  } else if (typeof opts.unicastFunc !== 'function') {
    throw new Error('NetbiosBroadcastMode() requires a unicast function');
  } else if (!opts.localMap) {
    throw new Error('NetbiosBroadcastMode() requires a local name map');
  } else if (!opts.remoteMap) {
    throw new Error('NetbiosBroadcastMode() requires a remote name map');
  }

  self._transactionIdFunc = opts.transactionIdFunc;
  self._broadcastFunc = opts.broadcastFunc;
  self._unicastFunc = opts.unicastFunc;
  self._localMap = opts.localMap;
  self._remoteMap = opts.remoteMap;

  self._type = 'broadcast';

  self._requestState = Object.create(null);

  return self;
}

function State(opts) {
  var self = (this instanceof NetbiosBroadcastMode)
           ? this
           : Object.create(State);

  self.count = opts.count || 0;
  self.timerId = opts.timerId || null;
  self.responseFunc = opts.responseFunc || null;
  self.noResponseFunc = opts.noResponseFunc || null;

  return self;
}

NetbiosBroadcastMode.prototype.add = function(opts, callback) {
  var self = this;
  var name = opts.name;
  var suffix = opts.suffix;
  var group = opts.group;
  var address = opts.address;
  var ttl = opts.ttl;

  if (self._localMap.contains(name, suffix)) {
    return;
  }

  var transactionId = self._transactionIdFunc();
  var request = {
    transactionId: transactionId,
    op: 'registration',
    broadcast: true,
    authoritative: true,
    recursionDesired: true,
    questions: [{name: name, suffix: suffix, type: 'nb'}],
    additionalRecords: [{
      name: name, suffix: suffix, type: 'nb', ttl: ttl,
      nb: { entries: [{address: address, type: self._type, group: group}] }
    }]
  };

  var state = new State({
    // In broadcast mode if we get a response then that means someone is
    // disputing our claim to this name.
    responseFunc: function(response) {
      delete self._requestState[transactionId];
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

    // If we send the required number of registration requests and do
    // not get a conflict response from any other nodes then we can
    // safely declare this name ours.
    noResponseFunc: function() {
      delete self._requestState[transactionId];
      self._localMap.add(name, suffix, group, address, ttl, self._type);
      self._sendRefresh(name, suffix);
      if (typeof callback === 'function') {
        callback(true);
      }
    }
  });

  self._requestState[transactionId] = state;
  self._sendRequest(request, self._broadcastFunc);
};

NetbiosBroadcastMode.prototype.remove = function(opts, callback) {
  var name = opts.name;
  var suffix = opts.suffix;

  var record = this._localMap.getNb(name, suffix);
  if (!record) {
    if (typeof callback === 'function') {
      calback();
    }
    return;
  }

  var transactionId = this._transactionIdFunc();
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

  this._requestState[transactionId] = new State({
    noResponseFunc: callback
  });

  this._localMap.remove(name, suffix);
  this._sendRequest(request, this._broadcastFunc);
};

NetbiosBroadcastMode.prototype.find = function(opts, callback) {
  var self = this;
  var name = opts.name;
  var suffix = opts.suffix;

  var record = self._localMap.getNb(name, suffix) ||
               self._remoteMap.getNb(name, suffix);
  if (record) {
    if (typeof callback === 'function') {
      callback(record.nb.entries[0].address);
    }
    return;
  }

  var transactionId = self._transactionIdFunc();
  var request = {
    transactionId: transactionId,
    op: 'query',
    broadcast: true,
    recursionDesired: true,
    questions: [{ name: name, suffix: suffix, type: 'nb', group: !!opts.group }]
  };

  var state = new State({
    noResponseFunc: function() {
      if (typeof callback === 'function') {
        callback(null);
      }
    },

    responseFunc: function(response) {
      var answer = response.answerRecords[0];
      var address = answer.nb.entries[0].address;
      // While not in the RFC, winxp seems to issue a status request before
      // concluding that a particular answer is valid.  This is probably to
      // guard against blatant spoofing.
      opts.address = address;
      self._sendStatus(opts, function(nbstat) {
        if (!nbstat || nbstat.answerRecords.length < 1 ||
            nbstat.answerRecords[0].nbstat.nodes.length < 1) {
          return;
        }

        self._remoteMap.update(answer);
        if (typeof callback === 'function') {
          callback(answer.nb.entries[0].address);
        }

        // If we get another response packet then there is a conflict and we
        // need to avoid treating this value as authoritative in our cache
        state.responseFunc = function(response2) {
          var answer2 = response2.answerRecords[0];
          var address2 = answer2.nb.entries[0].address;
          if (address !== address2) {
            self._sendConflict({
              transactionId: self._transactionIdFunc(),
              error: 'conflict',
              record: answer
            }, self._unicastFunc.bind(address2));
            self._remoteMap.remove(name, suffix);
          }
        };

        // We only need to check for the conflicting responses for a limited
        // time.  After that occurs, clear the request state.
        setTimeout(function() {
          delete self._requestState[transactionId];
        }, CONFLICT_DELAY_MS);
      });
    }
  });

  self._requestState[transactionId] = state;
  self._sendRequest(request, self._broadcastFunc);
};

NetbiosBroadcastMode.prototype.onResponse = function(msg, sendFunc) {
  // If we are expecting this response, then process it appropriately.  Ignore
  // spurious responses we are not expecting.
  var state = this._requestState[msg.transactionId];
  if (state && typeof state.responseFunc === 'function') {
    clearTimeout(state.timerId);
    state.timerId = null;
    state.responseFunc(msg, sendFunc);
  }
};

NetbiosBroadcastMode.prototype.onQuery = function(request, sendFunc) {
  var q = request.questions ? request.questions[0] : null;
  if (!q) {
    return;
  }

  var answer = null;
  if (q.type === 'nb') {
    answer = this._localMap.getNb(q.name, q.suffix);
  } else if (q.type === 'nbstat') {
    answer = this._localMap.getNbstat(q.name, q.suffix);
  }

  if (answer) {
    var response = {
      transactionId: request.transactionId,
      response: true,
      op: request.op,
      authoritative: true,
      answerRecords: [answer]
    };
    sendFunc(response);
  }
};

NetbiosBroadcastMode.prototype.onRegistration = function(request, sendFunc) {
  var rec = request.additionalRecords[0];

  // Check to see if we have this name claimed.  If both the local and remote
  // names are registered as a group, then there is no conflict.
  var localRec = this._localMap.getNb(rec.name, rec.suffix);
  if (!localRec ||
      localRec.nb.entries[0].address === rec.nb.entries[0].address &&
      (localRec.nb.entries[0].group && rec.nb.entries[0].group)) {
    return;
  }

  // Send a conflict response
  this._sendConflict({
    transactionId: request.transactionId,
    error: 'active',
    record: localRec
  }, sendFunc);
};

NetbiosBroadcastMode.prototype.onRelease = function(request, sendFunc) {
  var rec = request.additionalRecords[0];
  this._remoteMap.remove(rec.name, rec.suffix);
};

NetbiosBroadcastMode.prototype.onWack = function(request, sendFunc) {
  // ignore for broadcast mode
};

NetbiosBroadcastMode.prototype.onRefresh = function(request, sendFunc) {
  var rec = request.additionalRecords[0];

  // To be safe, ignore refresh requests for names we think we own.  This
  // shouldn't happen in theory.
  if (!this._localMap.contains(rec.name, rec.suffix)) {
    this._remoteMap.update(rec);
  }
};

NetbiosBroadcastMode.prototype._sendRequest = function(request, sendFunc) {
  sendFunc(request);

  var state = this._requestState[request.transactionId];
  if (state) {
    state.timerId = null;
    state.count += 1;

    // Schedule another packet if we have not hit the retry limit
    if (state.count < BCAST_RETRY_COUNT) {
      var sendFunc = this._sendRequest.bind(this, request, sendFunc);
      state.timerId = setTimeout(sendFunc, BCAST_RETRY_DELAY_MS);

    // Otherwise send no more requests and handle the "no response" condition
    } else if (typeof state.noResponseFunc === 'function') {
      state.noResponseFunc();
    } else {
      delete this._requestState[request.transactionId];
    }
  }
};

NetbiosBroadcastMode.prototype._sendConflict = function(opts, sendFunc) {
  var response = {
    transactionId: opts.transactionId,
    response: true,
    op: 'registration',
    authoritative: true,
    error: opts.error,
    answerRecords: [opts.record]
  };
  sendFunc(response);
};

NetbiosBroadcastMode.prototype._sendRefresh = function(name, suffix) {
  var record = this._localMap.getNb(name, suffix);
  if (!record) {
    return;
  }

  var transactionId = this._transactionIdFunc();
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
  delete this._requestState[transactionId];

  this._sendRequest(request, this._broadcastFunc);
};

NetbiosBroadcastMode.prototype._sendStatus = function(opts, callback) {
  var self = this;
  var transactionId = self._transactionIdFunc();
  var request = {
    transactionId: transactionId,
    op: 'query',
    recursionDesired: true,
    questions: [ {name: opts.name, suffix: opts.suffix, type: 'nbstat',
                  group: !!opts.group} ],
  };

  // TODO: The response handler should really detect if the truncation
  //       bit is set and re-request the status over TCP.  Its unclear
  //       how often this really happens in the real-world.

  var state = new State({
    responseFunc: function(msg, sendFunc) {
      delete self._requestState[transactionId];
      callback(msg)
    },
    noResponseFunc: callback
  });

  self._requestState[transactionId] = state;
  self._sendRequest(request, this._unicastFunc.bind(null, opts.address));
};
