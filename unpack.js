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

module.exports = unpack;

var con = require('./constant');
var ipv4 = require('./ipv4-util');
var unpackName = require('netbios-name/unpack');

function unpack(buf, callback) {
  var gError = null;
  var message = Object.create(null);
  var bytes = 0;

  // NOTE: The message must start at the beginning of the buffer, otherwise
  //       name pointer resolution will not work properly.

  // Parse the netbios packet header with the following structure:
  //  - 16-bit transaction id
  //  - 1-bit response code
  //  - 4-bit opcode
  //  - 7-bit nm flags
  //  - 4-bit rcode
  //  - 16-bit qdcount; number of entries in question section
  //  - 16-bit ancount; number of entries in answer section
  //  - 16-bit nscount; number of entries in authority section
  //  - 16-bit arcount; number of entries in additional records section

  if (12 > buf.length) {
    callback(new Error('Header is too large to fit in remaining packet ' +
                       'bytes.'));
    return;
  }

  //  - 16-bit transaction id
  message.transactionId = buf.readUInt16BE(bytes);
  bytes += 2;

  var tmp = buf.readUInt16BE(bytes);
  bytes += 2;

  //  - 1-bit response code
  message.response = ((tmp & 0x8000) >> 15) !== 0;

  //  - 4-bit opcode
  var opcode = (tmp & 0x7800) >> 11;
  message.op = con.OPCODE_TO_STRING[opcode];
  if (!message.op) {
    callback(new Error('Illegal NetBIOS opcode [' + opcode + ']'));
    return;
  }

  //  - 7-bit nm flags
  var nm_flags = (tmp & 0x07f0) >> 4;
  message.broadcast = (nm_flags & con.NM_FLAG_B) !== 0;
  message.recursionAvailable = (nm_flags & con.NM_FLAG_RA) !== 0;
  message.recursionDesired = (nm_flags & con.NM_FLAG_RD) !== 0;
  message.truncated = (nm_flags & con.NM_FLAG_TC) !== 0;
  message.authoritative = (nm_flags & con.NM_FLAG_AA) !== 0;

  //  - 4-bit rcode
  var rcode = tmp & 0x000f;
  message.error = con.RCODE_TO_STRING[rcode];
  if (message.error === undefined) {
    callback(new Error('Illegal NetBIOS rcode [' + rcode + ']'));
    return;
  }

  //  - 16-bit qdcount; number of entries in question section
  var qdcount = buf.readUInt16BE(bytes);
  bytes += 2;

  //  - 16-bit ancount; number of entries in answer section
  var ancount = buf.readUInt16BE(bytes);
  bytes += 2;

  //  - 16-bit nscount; number of entries in authority section
  var nscount = buf.readUInt16BE(bytes);
  bytes += 2;

  //  - 16-bit arcount; number of entries in additional records section
  var arcount = buf.readUInt16BE(bytes);
  bytes += 2;

  message.questions = [];
  message.answerRecords = [];
  message.authorityRecords = [];
  message.additionalRecords = [];

  // The rest of the packet consists of 4 sequentially packed arrays.  The
  // first contains questions and the remaining three contain resource
  // records.
  var toParse = [
    { len: qdcount, func: unpackQuestion, arr: message.questions },
    { len: ancount, func: unpackResourceRecord, arr: message.answerRecords },
    { len: nscount, func: unpackResourceRecord, arr: message.authorityRecords },
    { len: arcount, func: unpackResourceRecord, arr: message.additionalRecords }
  ];

  for (var p = 0, n = toParse.length; p < n && !gError; ++p) {
    for (var i = 0, m = toParse[p].len; i < m && !gError; ++i) {
      toParse[p].func(buf, bytes, function(error, rLen, record) {
        if (error) {
          gError = error;
          return;
        }

        bytes += rLen;
        toParse[p].arr.push(record);
      });
    }
  }

  callback(gError, bytes, message);
}

// Parse question section
//  - variable length compressed question name
//  - 16-bit question type
//  - 16-bit question class
function unpackQuestion(buf, offset, callback) {
  var bytes = 0;
  var question = Object.create(null);

  //  - variable length compressed question name
  unpackName(buf, offset + bytes, function(error, nameBytes, name, suffix) {

    if (error) {
      callback(error);
      return;
    }

    // Ensure we have enough space left before proceeding to avoid throwing
    if (offset + bytes + 4 > buf.length) {
      callback(new Error('Question section is too large to fit in remaining ' +
                         'packet bytes.'));
      return;
    }

    question.name = name;
    question.suffix = suffix;
    bytes += nameBytes;

    //  - 16-bit question type
    var t = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    question.type = con.QUESTION_TYPE_TO_STRING[t];
    if (question.type === undefined) {
      callback(new Error('Unexpected question type [' + t + '] for name [' +
                         question.name + '];  should be either [nb] or ' +
                         '[nbstat]'));
      return;
    }

    //  - 16-bit question class
    var clazz = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    if (clazz !== con.CLASS_IN) {
      callback(new Error('Unexpected question class [' + clazz +
                         '] for name [' + question.name + '];  should be [' +
                         CLASS_IN + ']'));
      return;
    }

    callback(null, bytes, question);
  });
}

var RR_TYPE_TO_PARSER = {
  'a': aRDataParser,
  'ns': nsRDataParser,
  'null': nullRDataParser,
  'nb': nbRDataParser,
  'nbstat': nbstatRDataParser
};

// Parse resource record:
//  - variable length name
//  - 16-bit RR type
//  - 16-bit RR class
//  - 32-bit TTL
//  - 16-bit resource data length in bytes
//  - variable length resource data
function unpackResourceRecord(buf, offset, callback) {
  var bytes = 0;

  //  - variable length name
  unpackName(buf, offset + bytes, function(error, nLen, name, suffix) {
    if (error) {
      callback(error);
      return;
    }

    bytes += nLen;

    var record = Object.create(null);
    record.name = name;
    record.suffix = suffix;

    //  - 16-bit RR type
    var t = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    record.type = con.RR_TYPE_TO_STRING[t];
    if (record.type === undefined) {
      callback(new Error('Illegal resource record type [' + t + '] for name [' +
                         name + ']'));
      return;
    }
    var rdataParser = RR_TYPE_TO_PARSER[record.type];

    //  - 16-bit RR class
    var clazz = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    if (clazz !== con.CLASS_IN) {
      callback(new Error('Unexpected resource record class [' + clazz +
                         '] for name [' + record.name + ']; expected class [' +
                         con.CLASS_IN + '].'));
      return;
    }

    //  - 32-bit TTL
    record.ttl = buf.readUInt32BE(offset + bytes);
    bytes += 4;

    //  - 16-bit resource data length in bytes
    var dataLen = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    //  - variable length resource data
    rdataParser(buf, offset + bytes, dataLen, record, function(error) {
      if (error) {
        callback(error);
        return;
      }

      bytes += dataLen;

      callback(null, bytes, record);
    });
  });
}

function aRDataParser(buf, offset, length, record, callback) {
  if (length !== 4) {
    callback(new Error('RData section of type [A] for name [' + record.name +
                       '] is unexpected length [' + length +
                       ']; expected [4].'));
    return;
  }

  var bytes = 0;

  var address = ipv4.inet_ntoa(buf.readUInt32BE(offset + bytes));
  bytes += 4;

  record.a = {
    address: address
  };

  callback(null);
}

function nsRDataParser(buf, offset, length, record, callback) {
  var bytes = 0;

  unpackName(buf, offset + bytes, function(error, nLen, name, suffix) {
    if (error) {
      callback(error);
      return;
    } else if (length !== nLen) {
      callback(new Expect('Unexpected NS record name length for record [' +
                          record.name + '].'));
      return;
    }

    bytes += nLen;

    record.ns = {
      name: name,
      suffix: suffix
    };

    record.ns = ns;

    callback(null);
  });
}

function nullRDataParser(buf, offset, length, record, callback) {
  if (length !== 0) {
    callback(new Error('RData section of type [NULL] for name [' + record.name +
                       '] is unexpected length [' + length +
                       ']; expected [0].'));
    return;
  }

  callback(null);
}

function nbRDataParser(buf, offset, length, record, callback) {
  if (length % 6 !== 0) {
    callback(new Error('RData section of type [NB] for name [' + record.name +
                       '] is unexpected length [' + length +
                       ']; should be multiple of [6].'));
    return;
  }

  var entries = [];
  var bytes = 0;

  while (bytes < length) {
    var entry = Object.create(null);
    entry.flags = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    entry.group = ((entry.flags & con.NB_FLAG_G) !== 0);
    var ont = (entry.flags & con.NB_FLAG_ONT) >> 13;
    entry.type = con.ONT_TO_STRING[ont];

    entry.address = ipv4.inet_ntoa(buf.readUInt32BE(offset + bytes));
    bytes += 4;

    entries.push(entry);
  }

  record.nb = {
    entries: entries
  };

  callback(null);
}

function nbstatRDataParser(buf, offset, length, record, callback) {
  var bytes = 0;

  // 8-bit number of names
  var numNames = buf.readUInt8(offset + bytes);
  bytes += 1;

  // Read each node name
  var nodes = [];
  for (var i = 0; i < numNames; ++i) {
    var node = Object.create(null);

    // 15-byte un-encoded netbios name.  This is the only place we do not
    // use encoded compressed names.
    var padded = buf.toString('ascii', offset + bytes, offset + bytes + 15);
    bytes += 15;
    node.name = padded.trim();

    // 1-byte suffix to complete the 16-byte fixed with netbios name
    node.suffix = buf.readUInt8(offset + bytes);
    bytes += 1;

    node.flags = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    node.permanent = (node.flags & con.NAME_FLAG_PRM) !== 0;
    node.active = (node.flags & con.NAME_FLAG_ACT) !== 0;
    node.conflict = (node.flags & con.NAME_FLAG_CNF) !== 0;
    node.deregister = (node.flags & con.NAME_FLAG_DRG) !== 0;
    var ont = (node.flags & con.NAME_FLAG_ONT) >> 13;
    node.type = con.ONT_TO_STRING[ont];
    node.group = (node.flags & con.NAME_FLAG_G) !== 0;

    nodes.push(node);
  }

  // Read the next 6 bytes as the unit ID.  This is the MAC address of the node
  // sending the nbstat response.  Convert the MAC address into a colon
  // separated string to represent the value.
  var unitId = '';
  for (var i = 0; i < 6; ++i) {
    if (unitId !== '') {
      unitId += ':';
    }

    var tmpByte = buf.readUInt8(offset + bytes);
    bytes += 1;

    var tmpStr = tmpByte.toString(16);
    if (tmpStr.length < 2) {
      unitId += '0';
    }

    unitId += tmpStr;
  }

  // Skip the remaining 40 bytes of the statistics section for now.  It's
  // structure is defined in the RFC, but it doesn't really describe what
  // the fields are.

  record.nbstat = {
    nodes: nodes,
    unitId: unitId
  };

  callback(null);
}
