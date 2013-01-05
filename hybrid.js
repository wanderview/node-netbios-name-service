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

module.exports = NetbiosHybridMode;

// TODO: Implement hybrid mode

function NetbiosHybridMode(opts) {
  var self = (this instanceof NetbiosHybridMode)
           ? this
           : Object.create(null);

  if (typeof opts.transactionIdFunc !== 'function') {
    throw new Error('NetbiosHybridMode() requires a transaction ID ' +
                    'creation function');
  } else if (!opts.localMap) {
    throw new Error('NetbiosHybridMode() requires a local name map');
  } else if (!opts.remoteMap) {
    throw new Error('NetbiosHybridMode() requires a remote name map');
  }

  self._transactionIdFunc = opts.transactionIdFunc;
  self._localMap = opts.localMap;
  self._remoteMap = opts.remoteMap;

  return self;
}

NetbiosHybridMode.prototype.add = function(opts, callback) {
};

NetbiosHybridMode.prototype.remove = function(opts, callback) {
};

NetbiosHybridMode.prototype.find = function(opts, callback) {
};

NetbiosHybridMode.prototype.onResponse = function(msg, sendFunc) {
};

NetbiosHybridMode.prototype.onQuery = function(request, sendFunc) {
};

NetbiosHybridMode.prototype.onRegistration = function(request, sendFunc) {
};

NetbiosHybridMode.prototype.onRelease = function(request, sendFunc) {
};

NetbiosHybridMode.prototype.onWack = function(request, sendFunc) {
};

NetbiosHybridMode.prototype.onRefresh = function(request, sendFunc) {
};
