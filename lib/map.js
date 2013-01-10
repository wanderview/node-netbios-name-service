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

module.exports = NetbiosNameMap;

var NBName = require('netbios-name');

var EventEmitter = require('events').EventEmitter;
var timers = require('timers');
var util = require('util');

util.inherits(NetbiosNameMap, EventEmitter);

var TIMER_DELAY_S = 1;
var TIMER_DELAY_MS = TIMER_DELAY_S * 1000;

function NetbiosNameMap(options) {
  var self = (this instanceof NetbiosNameMap)
           ? this
           : Object.create(NetbiosNameMap.prototype);

  EventEmitter.call(self);

  options = options || Object.create(null);

  self._map = Object.create(null);
  self._count = 0;
  self._timerId = null;
  self._enableTimeouts = (options.enableTimeouts !== undefined)
                       ? options.enableTimeouts
                       : true;

  return self;
}

NetbiosNameMap.prototype.getNb = function(nbname) {
  var entry = this._map[nbname.toString()];
  if (entry) {
    var record = {
      nbname: nbname,
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

NetbiosNameMap.prototype.getNbstat = function(nbname) {
  var nodes = [];
  for (var mapName in this._map) {
    var entry = this._map[mapName];

    // filter based on scope ID according to 15.1.4 in RFC1001
    if (nbname.scopeId === entry.nbname.scopeId) {
      var node = {
        nbname: entry.nbname,
        type: entry.type,
        group: entry.group,
        active: true
      };
      nodes.push(node);
    }
  }

  var record = {
    nbname: nbname,
    type: 'nbstat',
    ttl: 0,
    nbstat: { nodes: nodes }
  };

  return record;
};

NetbiosNameMap.prototype.contains = function(nbname) {
  return (this._map[nbname.toString()] !== undefined);
};

// TODO: Refactor add() and update() to use named parameters hash or
//       to take a class object.

NetbiosNameMap.prototype.add = function(nbname, group, address, ttl, type) {
  var mapName = nbname.toString();

  var entry = this._map[mapName];
  if (!entry) {
    entry = Object.create(null);
  }

  entry.nbname = new NBName(nbname);
  entry.ttl = ttl;
  entry.maxTtl = ttl;
  entry.address = address;
  entry.group = group;
  entry.type = type;

  if (!this._map[mapName]) {
    this._map[mapName] = entry;
    this._count += 1;
    this.emit('added', _copyEntry(entry));
  }

  this._setTimer();
};

NetbiosNameMap.prototype.update = function(record) {
  this.add(record.nbname, record.nb.entries[0].group,
           record.nb.entries[0].address, record.ttl,
           record.nb.entries[0].type);
};

NetbiosNameMap.prototype.remove = function(nbname) {
  var mapName = nbname.toString();
  var entry = this._map[mapName];
  if (entry) {
    delete this._map[mapName];
    this._count -= 1;

    if (this._count < 1) {
      this._clearTimer();
    }

    this.emit('removed', _copyEntry(entry));
  }
};

NetbiosNameMap.prototype.clear = function() {
  var self = this;
  var oldMap = self._map;
  self._map = Object.create(null);
  Object.keys(oldMap).forEach(function(mapName) {
    var entry = oldMap[mapName]
    self.emit('removed', _copyEntry(entry));
  });
  self._count = 0;
  self._clearTimer();
};

NetbiosNameMap.prototype._onTimer = function() {
  this.timerId = null;

  for (var mapName in this._map) {
    var entry = this._map[mapName];
    entry.ttl -= TIMER_DELAY_S;
    if (entry.ttl < 1) {
      entry.ttl = entry.maxTtl;
      this.emit('timeout', entry.nbname);
    }
  }

  this._setTimer();
};

NetbiosNameMap.prototype._setTimer = function() {
  if (this._count > 0 && !this._timerId && this._enableTimeouts) {
    this.timerId = timers.setTimeout(this._onTimer.bind(this), TIMER_DELAY_MS);
  }
};

NetbiosNameMap.prototype._clearTimer = function() {
  if (this._timerId) {
    timers.clearTimeout(this._timerId);
    this._timerId = null;
  }
};

function _copyEntry(entry) {
  return {
    nbname: new NBName(entry.nbname),
    address: entry.address,
    group: entry.group,
    ttl: entry.ttl,
    type: entry.type
  };
}
