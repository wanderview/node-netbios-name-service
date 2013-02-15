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

module.exports = pack;

var con = require('./constant');

var ip = require('ip');
var mac = require('mac-address');

// TODO: properly handle truncation and truncate flag due to buffer limits

function pack(buf, message) {
  var bytes = 0;

  //  - 16-bit transaction id
  buf.writeUInt16BE(message.transactionId, bytes);
  bytes += 2;

  //  - 1-bit response code
  var responseMask = 0;
  if (message.response) {
    responseMask |= 0x0001 << 15
  }

  //  - 4-bit opcode
  var opcodeMask = con.OPCODE_FROM_STRING[message.op];
  if (opcodeMask === undefined) {
    return {
      error: new Error('Illegal NetBIOS op value of [' + message.op + ']')
    };
  }
  opcodeMask <<= 11;

  //  - 7-bit nm flags
  var nmflagsMask = 0;
  if (message.broadcast) {
    nmflagsMask |= con.NM_FLAG_B;
  }
  if (message.recursionAvailable) {
    nmflagsMask |= con.NM_FLAG_RA;
  }
  if (message.recursionDesired) {
    nmflagsMask |= con.NM_FLAG_RD;
  }
  if (message.truncated) {
    nmflagsMask |= con.NM_FLAG_TC;
  }
  if (message.authoritative) {
    nmflagsMask |= con.NM_FLAG_AA;
  }
  nmflagsMask <<= 4;

  //  - 4-bit rcode
  var rcodeMask = 0;
  if (message.error !== undefined) {
    var rcodeMask = con.RCODE_FROM_STRING[message.error];
    if (rcodeMask === undefined) {
      return {
        error: new Error('Illegal NetBIOS rcode error [' + message.error + ']')
      };
    }
  }

  var combinedOut = responseMask | opcodeMask | nmflagsMask | rcodeMask;
  buf.writeUInt16BE(combinedOut, bytes);
  bytes += 2;

  //  - 16-bit qdcount; number of entries in question section
  var qdcount = message.questions ? message.questions.length : 0;
  buf.writeUInt16BE(qdcount, bytes);
  bytes += 2;

  //  - 16-bit ancount; number of entries in answer section
  var ancount = message.answerRecords ? message.answerRecords.length : 0;
  buf.writeUInt16BE(ancount, bytes);
  bytes += 2;

  //  - 16-bit nscount; number of entries in authority section
  var nscount = message.authorityRecords ? message.authorityRecords.length : 0;
  buf.writeUInt16BE(nscount, bytes);
  bytes += 2;

  //  - 16-bit arcount; number of entries in additional records section
  var arcount = message.additionalRecords ? message.additionalRecords.length : 0;
  buf.writeUInt16BE(arcount, bytes);
  bytes += 2;

  var gError = null;
  var nameMap = Object.create(null);

  // The rest of the packet consists of 4 sequentially packed arrays.  The
  // first contains questions and the remaining three contain resource
  // records.
  var toPack = [
    { arr: message.questions, func: packQuestion },
    { arr: message.answerRecords, func: packResourceRecord },
    { arr: message.authorityRecords, func: packResourceRecord },
    { arr: message.additionalRecords, func: packResourceRecord }
  ];

  for (var p = 0, n = toPack.length; p < n && !gError; ++p) {
    var arr = toPack[p].arr;
    if (arr) {
      for (var a = 0, m = arr.length; a < m && !gError; ++a) {
        var res = toPack[p].func(buf, bytes, nameMap, arr[a]);
        if (res.error) {
          return {error: res.error};
        }

        bytes += res.bytesWritten;
      }
    }
  }

  return {bytesWritten: bytes};
}

function packQuestion(buf, offset, nameMap, question) {
  var bytes = 0;

  var res = question.nbname.write(buf, offset, nameMap);
  if (res.error) {
    return {error: res.error};
  }

  bytes += res.bytesWritten;

  // 16-bit question type
  var type = con.QUESTION_TYPE_FROM_STRING[question.type];
  if (type === undefined) {
    return {
      error: new Error('Illegal question type [' + question.type +
                       '] for name [' + question.nbname + ']')
    };
  }
  buf.writeUInt16BE(type, offset + bytes);
  bytes += 2;

  // 16-bit question class
  buf.writeUInt16BE(con.CLASS_IN, offset + bytes);
  bytes += 2;

  return {bytesWritten: bytes};
}

var RR_TYPE_STRING_TO_WRITER = {
  'a': aRDataWriter,
  'ns': nsRDataWriter,
  'null': nullRDataWriter,
  'nb': nbRDataWriter,
  'nbstat': nbstatRDataWriter
};

function packResourceRecord(buf, offset, nameMap, record) {
  var bytes = 0;

  var res = record.nbname.write(buf, offset, nameMap);
  if (res.error) {
    return {error: res.error};
  }

  bytes += res.bytesWritten;

  // 16-bit resource record type
  var type = con.RR_TYPE_FROM_STRING[record.type];
  var writer = RR_TYPE_STRING_TO_WRITER[record.type];
  if (type === undefined || writer === undefined) {
    return {
      error: new Error('Illegal NetBIOS resource record type [' +
                       record.type + '] for name [' + record.nbname + ']')
    };
  }
  buf.writeUInt16BE(type, offset + bytes);
  bytes += 2;

  // 16-bit resource record class
  buf.writeUInt16BE(con.CLASS_IN, offset + bytes);
  bytes += 2;

  // 32-bit time-to-live (TTL)
  buf.writeUInt32BE(record.ttl, offset + bytes);
  bytes += 4;

  var res = writer(buf, offset + bytes, nameMap, record);
  if (res.error) {
    return {error: res.error};
  }

  bytes += res.bytesWritten;

  return {bytesWritten: bytes};
}

function nullRDataWriter(buf, offset, nameMap, record) {
  var bytes = 0;

  // NULL type always has an rdata length of zero
  buf.writeUInt16BE(0, offset + bytes);
  bytes += 2;

  return {bytesWritten: bytes};
}

function aRDataWriter(buf, offset, nameMap, record) {
  var bytes = 0;

  // A type always has an rdata length of 4
  buf.writeUInt16BE(4, offset + bytes);
  bytes += 2;

  // Write the IP address out
  var inet = ip.toBuffer(record.a.address);
  inet.copy(buf, offset + bytes);
  bytes += 4;

  return {bytesWritten: bytes};
}

function nsRDataWriter(buf, offset, nameMap, record) {
  var bytes = 0;

  // We don't know the length of the rdata section yet because it contains a
  // variable length name.  Therefore, skip the first 2 bytes and write the
  // name first.
  var skip = 2;
  var res = record.ns.nbname.write(buf, offset + skip, nameMap);
  if (res.error) {
    return {error: res.error};
  }

  // Now go back and write the length of the name
  buf.writeUInt16BE(res.bytesWritten, offset + bytes);
  bytes += 2;

  // finally, acbytes for the length of the name in our acbytesing
  bytes += nLen;

  return {bytesWritten: bytes};
}

function nbRDataWriter(buf, offset, nameMap, record) {
  var bytes = 0;

  var length = record.nb.entries.length * 6;
  buf.writeUInt16BE(length, offset + bytes);
  bytes += 2;

  record.nb.entries.forEach(function(entry) {
    // 16-bit nb flags
    var groupMask = entry.group ? NB_FLAG_G : 0;

    var ont = con.ONT_FROM_STRING[entry.type];
    var ontMask = ont << 13;
    var flags = groupMask | ontMask;
    buf.writeUInt16BE(flags, offset + bytes);
    bytes += 2;

    // 32-bit IP address
    var inet = ip.toBuffer(entry.address);
    inet.copy(buf, offset + bytes);
    bytes += 4;
  });

  return {bytesWritten: bytes};
}

function nbstatRDataWriter(buf, offset, nameMap, record) {
  var bytes = 0;

  // 16-bit rdata length - skip until we write rest
  bytes += 2;

  // 8-bit node name array
  buf.writeUInt8(record.nbstat.nodes.length, offset + bytes);
  bytes += 1;

  // write each node - use C style for loop instead of closure style
  // for easy return on error
  for (var i = 0, n = record.nbstat.nodes.length; i < n; ++i) {
    var node = record.nbstat.nodes[i];

    // 15-byte un-encoded name
    buf.write(node.nbname.paddedName, offset + bytes);
    bytes += node.nbname.paddedName.length;

    // 1-byte suffix
    buf.writeUInt8(node.nbname.suffix, offset + bytes);
    bytes += 1;

    // 16-bit flags
    var permanentMask = node.permanent ? con.NAME_FLAG_PRM : 0;
    var activeMask = node.active ? con.NAME_FLAG_ACT : 0;
    var conflictMask = node.conflict ? con.NAME_FLAG_CNF : 0;
    var deregisterMask = node.deregister ? con.NAME_FLAG_DRG : 0;
    var ont = con.ONT_FROM_STRING[node.type];
    var ontMask = ont << 13;
    var groupMask = node.group ? con.NAME_FLAG_G : 0;

    var flags = permanentMask | activeMask | conflictMask | deregisterMask |
                ontMask | groupMask;
    buf.writeUInt16BE(flags, offset + bytes);
    bytes += 2;
  }

  // If we have a unit ID (MAC address), then convert from its colon separated
  // string form to the binary 6-byte form.
  if (record.nbstat.unitId) {
    try {
      mac.toBuffer(record.nbstat.unitId, buf, offset + bytes);
      bytes += mac.LENGTH;
    } catch (error) {
      return { error: error };
    }

  // Otherwise if we don't have a value just zero fill the unit ID
  } else {
    buf.fill(0, offset + bytes, offset + bytes + 6);
    bytes += 6;
  }

  // 40 bytes of poorly defined statistics.  Just zero fill for now.
  buf.fill(0, offset + bytes, offset + bytes + 40);
  bytes += 40;

  // Go back and write the rdata length, two less than our total bytes.  We
  // must subtract two bytes for the space we skipped over at the start of
  // the function.
  var rdataLen = bytes - 2;
  buf.writeUInt16BE(rdataLen, offset);

  return {bytesWritten: bytes};
}
