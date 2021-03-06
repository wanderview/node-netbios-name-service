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

module.exports = NetbiosPointMode;

// TODO: Implement point mode

function NetbiosPointMode(opts) {
  var self = (this instanceof NetbiosPointMode)
           ? this
           : Object.create(null);

  if (typeof opts.transactionIdFunc !== 'function') {
    throw new Error('NetbiosPointMode() requires a transaction ID creation ' +
                    'function');
  } else if (!opts.localMap) {
    throw new Error('NetbiosPointMode() requires a local name map');
  } else if (!opts.remoteMap) {
    throw new Error('NetbiosPointMode() requires a remote name map');
  }

  self._transactionIdFunc = opts.transactionIdFunc;
  self._localMap = opts.localMap;
  self._remoteMap = opts.remoteMap;

  self._localMap.on('timeout', self._sendRefresh.bind(self));

  return self;
}

NetbiosPointMode.prototype.add = function(opts, callback) {
};

NetbiosPointMode.prototype.remove = function(opts, callback) {
};

NetbiosPointMode.prototype.find = function(opts, callback) {
};

NetbiosPointMode.prototype.onResponse = function(msg, sendFunc) {
};

NetbiosPointMode.prototype.onQuery = function(request, sendFunc) {
};

NetbiosPointMode.prototype.onRegistration = function(request, sendFunc) {
};

NetbiosPointMode.prototype.onRelease = function(request, sendFunc) {
};

NetbiosPointMode.prototype.onWack = function(request, sendFunc) {
};

NetbiosPointMode.prototype.onRefresh = function(request, sendFunc) {
};

NetbiosPointMode.prototype._sendRefresh = function(nbname) {
};
