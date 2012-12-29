"use strict";

var con = require('./constant');
var nbname = require('netbios-name');

var RR_TYPE_STRING_TO_WRITER = {
  'a': aRDataWriter,
  'ns': nsRDataWriter,
  'null': nullRDataWriter,
  'nb': nbRDataWriter,
  'nbstat': nbstatRDataWriter
};

// TODO: properly handle truncation and truncate flag due to buffer limits

function packQuestion(buf, offset, nameMap, question, callback) {
  var bytes = 0;

  nbname.pack(buf, offset, nameMap, question.name, question.suffix, function(error, nLen) {
    if (error) {
      callback(error);
      return;
    }

    bytes += nLen;

    // 16-bit question type
    var type = con.QUESTION_TYPE_FROM_STRING[question.type];
    if (type === undefined) {
      callback('Illegal question type [' + question.type + '] for name [' +
               question.name + ']');
      return;
    }
    buf.writeUInt16BE(type, offset + bytes);
    bytes += 2;

    // 16-bit question class
    buf.writeUInt16BE(con.CLASS_IN, offset + bytes);
    bytes += 2;

    callback(null, bytes);
  });
}

function nullRDataWriter(buf, offset, nameMap, record, callback) {
  var bytes = 0;

  // NULL type always has an rdata length of zero
  buf.writeUInt16BE(0, offset + bytes);
  bytes += 2;

  callback(null, bytes);
}

function aRDataWriter(buf, offset, nameMap, record, callback) {
  var bytes = 0;

  // A type always has an rdata length of 4
  buf.writeUInt16BE(4, offset + bytes);
  bytes += 2;

  // Write the IP address out
  var inet = stringToInet(record.a.address);
  buf.writeUInt32BE(inet, offset + bytes);
  bytes += 4;

  callback(null, bytes);
}

function nsRDataWriter(buf, offset, nameMap, record, callback) {
  var bytes = 0;

  // We don't know the length of the rdata section yet because it contains a
  // variable length name.  Therefore, skip the first 2 bytes and write the
  // name first.
  var skip = 2;
  nbname.pack(buf, offset + skip, nameMap, record.ns.name, record.ns.suffix, function(error, nLen) {
    if (error) {
      callback(error);
      return;
    }

    // Now go back and write the length of the name
    buf.writeUInt16BE(nLen, offset + bytes);
    bytes += 2;

    // finally, acbytes for the length of the name in our acbytesing
    bytes += nLen;

    callback(null, bytes);
  });
}

function nbRDataWriter(buf, offset, nameMap, record, callback) {
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
    var inet = stringToInet(entry.address);
    buf.writeUInt32BE(inet, offset + bytes);
    bytes += 4;
  });

  callback(null, bytes);
}

function nbstatRDataWriter(buf, offset, nameMap, record, callback) {
  var bytes = 0;

  // 16-bit rdata length - skip until we write rest
  bytes += 2;

  // 8-bit node name array
  buf.writeUInt8(record.nbstat.nodes.length, offset + bytes);
  bytes += 1;

  // write each node - use C style for loop instead of closure style
  // for easy return on error
  for (var i = 0; i < record.nbstat.nodes.length; ++i) {
    var node = record.nbstat.nodes[i];

    // 15-byte un-encoded name
    var gError = null;
    var netbiosName
    nbname.decompose(node.name, function(error, nbName) {
      if (error) {
        gError = error;
      }
      netbiosName = nbName;
    });
    if (gError) {
      callback(gError)
      return;
    }
    buf.write(netbiosName, offset + bytes);
    bytes += netbiosName.length;

    // 1-byte suffix
    buf.writeUInt8(node.suffix, offset + bytes);
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
    var u = record.nbstat.unitId;
    var lastIndex = 0;
    var colonIndex = 0;
    for (var i = 0; i < 5; ++i) {
      colonIndex = u.indexOf(':', lastIndex);
      if (colonIndex <= lastIndex) {
        callback('Invalid unit ID [' + u +
                 ']; should follow pattern [##:##:##:##:##:##]');
        return;
      }

      var tmpStr = u.substr(lastIndex, (colonIndex - lastIndex));
      var tmpByte = parseInt(tmpStr, 16);
      buf.writeUInt8(tmpByte, offset + bytes);
      bytes += 1;

      lastIndex = colonIndex + 1;
    }

    var tmpStr = u.substr(lastIndex, (u.length - lastIndex));
    var tmpByte = parseInt(tmpStr, 16);
    buf.writeUInt8(tmpByte, offset + bytes);
    bytes += 1;

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

  callback(null, bytes);
}

function packResourceRecord(buf, offset, nameMap, record, callback) {
  var bytes = 0;

  nbname.pack(buf, offset, nameMap, record.name, record.suffix, function(error, nLen) {
    if (error) {
      callback(error);
      return;
    }

    bytes += nLen;

    // 16-bit resource record type
    var type = con.RR_TYPE_FROM_STRING[record.type];
    var writer = RR_TYPE_STRING_TO_WRITER[record.type];
    if (type === undefined || writer === undefined) {
      callback('Illegal NetBIOS resource record type [' + record.type +
               '] for name [' + record.name + ']');
    }
    buf.writeUInt16BE(type, offset + bytes);
    bytes += 2;

    // 16-bit resource record class
    buf.writeUInt16BE(con.CLASS_IN, offset + bytes);
    bytes += 2;

    // 32-bit time-to-live (TTL)
    buf.writeUInt32BE(record.ttl, offset + bytes);
    bytes += 4;

    writer(buf, offset + bytes, nameMap, record, function(error, rLen) {
      if (error) {
        callback(error);
        return;
      }

      bytes += rLen;

      callback(null, bytes);
    });
  });
}

module.exports = function(buf, message, callback) {
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
    callback('Illegal NetBIOS op value of [' + message.op + ']');
    return;
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
      callback('Illegal NetBIOS rcode error [' + message.error + ']');
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
  var nameMap = {};

  // The rest of the packet consists of 4 sequentially packed arrays.  The
  // first contains questions and the remaining three contain resource
  // records.
  var toPack = [
    { arr: message.questions, func: packQuestion },
    { arr: message.answerRecords, func: packResourceRecord },
    { arr: message.authorityRecords, func: packResourceRecord },
    { arr: message.additionalRecords, func: packResourceRecord }
  ];

  for (var p = 0; p < toPack.length && !gError; ++p) {
    var arr = toPack[p].arr;
    for (var a = 0; arr && a < arr.length && !gError; ++a) {
      toPack[p].func(buf, bytes, nameMap, arr[a], function(error, rLen) {
        if (error) {
          gError = error;
          return;
        }

        bytes += rLen;
      });
    }
  }

  callback(gError, bytes);
}

function stringToInet(str) {
  var p = str.split('.');

  // Note: mulitply by 256 instead of shifting to avoid negative number
  // Note: Use + prefix on string part to force number type coercion
  var inet = (+p[0]) * 256 * 256 * 256;
  inet += (+p[1]) * 256 * 256;
  inet += (+p[2]) * 256;
  inet += (+p[3]);

  return inet;
}