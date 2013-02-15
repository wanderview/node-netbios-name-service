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
var NBName = require('netbios-name');

var ip = require('ip');
var mac = require('mac-address');

function unpack(buf) {
  var message = {};
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
    return {
      error: new Error('Header is too large to fit in remaining packet ' +
                       'bytes.')
    };
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
    return {
      error: new Error('Illegal NetBIOS opcode [' + opcode + ']')
    };
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
    return {
      error: new Error('Illegal NetBIOS rcode [' + rcode + ']')
    };
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

  for (var p = 0, n = toParse.length; p < n; ++p) {
    for (var i = 0, m = toParse[p].len; i < m; ++i) {
      var res = toParse[p].func(buf, bytes);
      if (res.error) {
        return {error: res.error};
      }

      bytes += res.bytesRead;
      toParse[p].arr.push(res.record);
    }
  }

  return {bytesRead: bytes, message: message};
}

// Parse question section
//  - variable length compressed question name
//  - 16-bit question type
//  - 16-bit question class
function unpackQuestion(buf, offset) {
  var bytes = 0;
  var question = {};

  //  - variable length compressed question name
  var nbname = NBName.fromBuffer(buf, offset + bytes);
  if (nbname.error) {
    return {error: nbname.error};
  }

  question.nbname = nbname;
  bytes += nbname.bytesRead;

  // Ensure we have enough space left before proceeding to avoid throwing
  if (offset + bytes + 4 > buf.length) {
    return {
      error: new Error('Question section is too large to fit in remaining ' +
                       'packet bytes.')
    };
  }

  //  - 16-bit question type
  var t = buf.readUInt16BE(offset + bytes);
  bytes += 2;

  question.type = con.QUESTION_TYPE_TO_STRING[t];
  if (question.type === undefined) {
    return {
      error: new Error('Unexpected question type [' + t + '] for name [' +
                       question.nbname + '];  should be either [nb] or ' +
                       '[nbstat]')
    };
  }

  //  - 16-bit question class
  var clazz = buf.readUInt16BE(offset + bytes);
  bytes += 2;

  if (clazz !== con.CLASS_IN) {
    return {
      error: new Error('Unexpected question class [' + clazz +
                       '] for name [' + question.nbname + '];  should be [' +
                       CLASS_IN + ']')
    };
  }

  return {bytesRead: bytes, record: question};
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
function unpackResourceRecord(buf, offset) {
  var bytes = 0;

  //  - variable length name
  var nbname = NBName.fromBuffer(buf, offset + bytes);
  if (nbname.error) {
    return {error: nbname.error};
  }

  bytes += nbname.bytesRead;

  var record = {};
  record.nbname = nbname;

  //  - 16-bit RR type
  var t = buf.readUInt16BE(offset + bytes);
  bytes += 2;

  record.type = con.RR_TYPE_TO_STRING[t];
  if (record.type === undefined) {
    return {
      error: new Error('Illegal resource record type [' + t + '] for name [' +
                       nbname + ']')
    };
  }
  var rdataParser = RR_TYPE_TO_PARSER[record.type];

  //  - 16-bit RR class
  var clazz = buf.readUInt16BE(offset + bytes);
  bytes += 2;

  if (clazz !== con.CLASS_IN) {
    return {
      error: new Error('Unexpected resource record class [' + clazz +
                       '] for name [' + record.nbname + ']; expected class [' +
                       con.CLASS_IN + '].')
    };
  }

  //  - 32-bit TTL
  record.ttl = buf.readUInt32BE(offset + bytes);
  bytes += 4;

  //  - 16-bit resource data length in bytes
  var dataLen = buf.readUInt16BE(offset + bytes);
  bytes += 2;

  //  - variable length resource data
  var res = rdataParser(buf, offset + bytes, dataLen, record);
  if (res.error) {
    return {error: res.error};
  }

  bytes += res.bytesRead;

  return {bytesRead: bytes, record: record};
}

function aRDataParser(buf, offset, length, record) {
  if (length !== 4) {
    return {
      error: new Error('RData section of type [A] for name [' + record.nbname +
                       '] is unexpected length [' + length +
                       ']; expected [4].')
    };
  }

  var bytes = 0;

  var address = ip.toString(buf.slice(offset + bytes, offset + bytes + 4));
  bytes += 4;

  record.a = {
    address: address
  };

  return {bytesRead: bytes};
}

function nsRDataParser(buf, offset, length, record) {
  var bytes = 0;

  var nbname = NBName.fromBuffer(buf, offset + bytes);
  if (nbname.error) {
    return {error: nbname.error};
  } else if (length !== nbname.bytesRead) {
    return {
      error: new Expect('Unexpected NS record name length for record [' +
                        record.nbname + '].')
    };
  }

  bytes += nbname.bytesRead;

  record.ns = {
    nbname: nbname,
  };

  return {bytesRead: bytes};
}

function nullRDataParser(buf, offset, length, record) {
  if (length !== 0) {
    return {
      error: new Error('RData section of type [NULL] for name [' + record.nbname +
                       '] is unexpected length [' + length +
                       ']; expected [0].')
    };
  }

  return {bytesRead: 0};
}

function nbRDataParser(buf, offset, length, record) {
  if (length % 6 !== 0) {
    return {
      error: new Error('RData section of type [NB] for name [' + record.nbname +
                       '] is unexpected length [' + length +
                       ']; should be multiple of [6].')
    };
  }

  var entries = [];
  var bytes = 0;

  while (bytes < length) {
    var entry = {};
    var flags = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    entry.group = ((flags & con.NB_FLAG_G) !== 0);
    var ont = (flags & con.NB_FLAG_ONT) >> 13;
    entry.type = con.ONT_TO_STRING[ont];

    entry.address = ip.toString(buf.slice(offset + bytes, offset + bytes + 4));
    bytes += 4;

    entries.push(entry);
  }

  record.nb = {
    entries: entries
  };

  return {bytesRead: bytes};
}

function nbstatRDataParser(buf, offset, length, record) {
  var bytes = 0;

  // 8-bit number of names
  var numNames = buf.readUInt8(offset + bytes);
  bytes += 1;

  // Read each node name
  var nodes = [];
  for (var i = 0; i < numNames; ++i) {
    var node = {};

    // 15-byte un-encoded netbios name.  This is the only place we do not
    // use encoded compressed names.
    var padded = buf.toString('ascii', offset + bytes, offset + bytes + 15);
    bytes += 15;

    // 1-byte suffix to complete the 16-byte fixed with netbios name
    var suffix = buf.readUInt8(offset + bytes);
    bytes += 1;

    node.nbname = new NBName({fqdn: padded.trim(), suffix: suffix});
    if (node.nbname.error) {
      return {error: node.nbname.error};
    }

    var flags = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    node.permanent = (flags & con.NAME_FLAG_PRM) !== 0;
    node.active = (flags & con.NAME_FLAG_ACT) !== 0;
    node.conflict = (flags & con.NAME_FLAG_CNF) !== 0;
    node.deregister = (flags & con.NAME_FLAG_DRG) !== 0;
    var ont = (flags & con.NAME_FLAG_ONT) >> 13;
    node.type = con.ONT_TO_STRING[ont];
    node.group = (flags & con.NAME_FLAG_G) !== 0;

    nodes.push(node);
  }

  // Read the next 6 bytes as the unit ID.  This is the MAC address of the node
  // sending the nbstat response.  Convert the MAC address into a colon
  // separated string to represent the value.
  var unitId = null;
  try {
    unitId = mac.toString(buf, offset + bytes);
    bytes += mac.LENGTH;
  } catch (error) {
    return {error: error};
  }

  // Skip the remaining 40 bytes of the statistics section for now.  It's
  // structure is defined in the RFC, but it doesn't really describe what
  // the fields are.
  bytes += 40;

  record.nbstat = {
    nodes: nodes,
    unitId: unitId
  };

  return {bytesRead: bytes};
}
