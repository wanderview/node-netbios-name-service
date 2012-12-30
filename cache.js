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

module.exports = NetbiosNameServiceCache;

var timers = require('timers');

var TIMER_DELAY_S = 1;
var TIMER_DELAY_MS = TIMER_DELAY_S * 1000;

function NetbiosNameServiceCache(options) {
  var self = (this instanceof NetbiosNameServiceCache)
           ? this
           : Object.create(NetbiosNameServiceCache.prototype);

  options = options || Object.create(null);

  self._map = Object.create(null);
  self._count = 0;
  self._timerId = null;
  self._enableTimeouts = (options.enableTimeouts !== undefined)
                       ? options.enableTimeouts
                       : true;

  return self;
}

NetbiosNameServiceCache.prototype.get = function(name, suffix) {
  return this._get(name + '-' + suffix);
};

NetbiosNameServiceCache.prototype.getAll = function() {
  var results = [];
  for (var mapName in this._map) {
    results.push(this._get(mapName));
  }
  return results;
};

NetbiosNameServiceCache.prototype._get = function(mapName) {
  var entry = this._map[mapName];
  if (entry) {
    var record = {
      name: entry.name,
      suffix: entry.suffix,
      ttl: entry.ttl,
      type: 'nb',
      nb: {
        entries: [{ type: entry.type,
                    address: entry.address,
                    group: entry.group }]
      }
    };
    return record;
  }

  return null;
};

NetbiosNameServiceCache.prototype.contains = function(name, suffix) {
  var mapName = name + '-' + suffix;
  return (this._map[mapName] !== undefined);
};

NetbiosNameServiceCache.prototype.update = function(record) {
  var mapName = record.name + '-' + record.suffix;

  var entry = this._map[mapName];
  if (!entry) {
    entry = Object.create(null);
    entry.name = record.name;
    entry.suffix = record.suffix;
    this._map[mapName] = entry;
    this._count += 1;
  }

  entry.ttl = record.ttl;
  entry.type = record.nb.entries[0].type;
  entry.address = record.nb.entries[0].address;
  entry.group = record.nb.entries[0].group;

  if (!this._timerId && this._enableTimeouts) {
    this._timerId = timers.setTimeout(this._onTimer.bind(this), TIMER_DELAY_MS);
  }
};

NetbiosNameServiceCache.prototype.remove = function(name, suffix) {
  this._remove(name + '-' + suffix);
};

NetbiosNameServiceCache.prototype._remove = function(mapName) {
  var entry = this._map[mapName];
  if (entry) {
    delete this._map[mapName];
    this._count -= 1;

    if (this._count < 1) {
      this._clearTimer();
    }
  }
};

NetbiosNameServiceCache.prototype.clear = function() {
  this._map = Object.create(null);
  this._count = 0;
  this._clearTimer();
};

NetbiosNameServiceCache.prototype._onTimer = function() {
  this.timerId = null;

  for (var mapName in this._map) {
    var entry = this._map[mapName];
    entry.ttl -= TIMER_DELAY_S;
    if (entry.ttl < 1) {
      this._remove(mapName);
    }
  }

  if (this._count > 0 && this._enableTimeouts) {
    this.timerId = timers.setTimeout(this._onTimer.bind(this), TIMER_DELAY_MS);
  }
};

NetbiosNameServiceCache.prototype._clearTimer = function() {
  if (this._timerId) {
    timers.clearTimeout(this._timerId);
    this._timerId = null;
  }
};
