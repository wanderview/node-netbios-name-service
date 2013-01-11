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

module.exports = NetbiosMessage;

var nbpack = require('./pack');
var nbunpack = require('./unpack');

function NetbiosMessage(opts) {
  var self = (this instanceof NetbiosMessage)
           ? this
           : Object.create(NetbiosMessage.prototype);

  opts = opts || {};

  self.transactionId = opts.transactionId || 0;
  self.op = opts.op;
  self.error = opts.error || '';

  self.broadcast = !!opts.broadcast;
  self.recursionAvailable = !!opts.recursionAvailable;
  self.recursionDesired = !!opts.recursionDesired;
  self.authoritative = !!opts.authoritative;
  self.truncated = !!opts.truncated;

  if (opts.question) {
    var q = opts.question;
    self.question = {
      nbname: q.nbname,
      type: q.type
    };
  }

  self.answer = _copyRecord(opts.answer);
  self.additional = _copyRecord(opts.additional);

  return self;
}

NetbiosMessage.fromBuffer = function(buf) {

  var res = nbunpack(buf);
  if (res.error) {
    return {error: res.error};
  }

  return {bytesRead: res.bytesRead, message: new NetbiosMessage(res.message)};
}

NetbiosMessage.fromRaw = function(raw) {
  var question = null;
  if (raw.questions && raw.questions.length > 0) {
    var q = raw.questions[0];
    question = {
      nbname: q.nbname,
      type: q.type
    };
  }

  var answer = null;
  if (raw.answerRecords && raw.answerRecords.length > 0) {
    answer = _recordFromRaw(raw.answerRecords[0]);
  }

  var additional = null;
  if (raw.additionalRecords && raw.additionalRecords.length > 0) {
    additional = _recordFromRaw(raw.additionalRecords[0]);
  }

  return new NetbiosMessage({
    transactionId: raw.transactionId || 0,
    op: raw.op,
    error: raw.hasOwnProperty('error') ? raw.error : '',
    broadcast: raw.broadcast,
    recursionAvailable: raw.recursionAvailable,
    recursionDesired: raw.recursionDesired,
    authoritative: raw.authoritative,
    truncated: raw.truncated,
    question: question,
    answer: answer,
    additional: additional
  });
}

NetbiosMessage.prototype.toRaw = function() {
  var rtn = {
    transactionId: this.transactionId,
    op: this.op,
    error: this.error,
    broadcast: this.broadcast,
    recursionAvailable: this.recursionAvailable,
    recursionDesired: this.recursionDesired,
    authoritative: this.authoritative,
    truncated: this.truncated,
    questions: [],
    answerRecords: [],
    authorityRecords: [],
    additionalRecords: []
  };

  if (this.question) {
    var q = this.question;
    rtn.questions.push({
      entries: [{ nbname: q.nbname, type: q.type }]
    });
  }

  if (this.answer) {
    rtn.answerRecords.push(_recordToRaw(this.answer));
  }

  if (this.additional) {
    rtn.additionalRecords.push(_recordToRaw(this.additional));
  }

  return rtn;
};

NetbiosMessage.prototype.pack = function(buf, callback) {
  return nbpack(buf, this.toRaw());
};

function _recordFromRaw(rr) {
  if (!rr) {
    return null;
  }

  var rtn = {
    nbname: rr.nbname,
    type: rr.type,
    ttl: rr.ttl
  };

  if (rr.type === 'nb' && rr.nb && rr.nb.entries && rr.nb.entries.length > 0) {
    var e = rr.nb.entries[0];
    rtn.address = e.address;
    rtn.mode = e.type;
    rtn.group = !!e.group;
  } else if (rr.type === 'nbstat' && rr.nbstat && rr.nbstat.nodes) {
    rtn.nodes = [];

    rr.nbstat.nodes.forEach(function(node) {
      rtn.nodes.push({
        nbname: node.nbname,
        mode: node.type,
        group: !!node.group,
        permanent: !!node.permanent,
        active: !!node.active,
        conflict: !!node.conflict,
        deregister: !!node.deregister
      });
    });

    rtn.unitId = rr.nbstat.unitId;
  }

  return rtn;
};

function _recordToRaw(rr) {
  var rtn = {
    nbname: rr.nbname,
    type: rr.type,
    ttl: rr.ttl
  };

  if (rr.type === 'nb') {
    rtn.nb = {
      entries: [{
        address: rr.address,
        type: rr.mode,
        group: !!rr.group
      }]
    };
  } else if (rr.type === 'nbstat') {
    rtn.nbstat = {
      unitId: rr.unitId,
      nodes: []
    };
    rr.nodes.forEach(function(node) {
      rtn.nbstat.nodes.push({
        nbname: node.nbname,
        type: node.mode,
        group: !!node.group,
        permanent: !!node.permanent,
        active: !!node.active,
        conflict: !!node.conflict,
        deregister: !!node.deregister
      });
    });
  }
}

function _copyRecord(rr) {
  if (!rr) {
    return null;
  }

  var rtn = {
    nbname: rr.nbname,
    type: rr.type,
    ttl: rr.ttl
  };

  if (rr.type === 'nb') {
    rtn.address = rr.address;
    rtn.mode = rr.mode;
    rtn.group = !!rr.group;
  } else if (rr.type === 'nbstat') {
    rtn.unitId = rr.unitId;
    rtn.nodes = [];
    rr.nodes.forEach(function(node) {
      rtn.nodes.push({
        nbname: node.nbname,
        mode: node.mode,
        group: !!node.group,
        permanent: !!node.permanent,
        active: !!node.active,
        conflict: !!node.conflict,
        deregister: !!node.deregister
      });
    });
  }

  return rtn;
}
