"use strict";

var con = require('./constant');
var unpackName = require('netbios-name/unpack');

var RR_TYPE_TO_PARSER = {
  'a': aRDataParser,
  'ns': nsRDataParser,
  'null': nullRDataParser,
  'nb': nbRDataParser,
  'nbstat': nbstatRDataParser
};

// Parse question section
//  - variable length compressed question name
//  - 16-bit question type
//  - 16-bit question class
function parseQuestion(buf, offset, callback) {
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
      callback('Question section is too large to fit in remaining packet bytes.');
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
      callback('Unexpected question type [' + t + '] for name [' +
               question.name + '];  should be either [' + QUESTION_TYPE_NB +
               '] or [' + QUESTION_TYPE_NBSTAT + ']');
      return;
    }

    //  - 16-bit question class
    var clazz = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    if (clazz !== con.CLASS_IN) {
      callback('Unexpected question class [' + clazz + '] for name [' +
               question.name + '];  should be [' + CLASS_IN + ']');
      return;
    }

    callback(null, bytes, question);
  });
}

// Parse resource record:
//  - variable length name
//  - 16-bit RR type
//  - 16-bit RR class
//  - 32-bit TTL
//  - 16-bit resource data length in bytes
//  - variable length resource data
function parseResourceRecord(buf, offset, callback) {
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
      callback('Illegal resource record type [' + t + '] for name [' +
               name + ']');
      return;
    }
    var rdataParser = RR_TYPE_TO_PARSER[record.type];

    //  - 16-bit RR class
    var clazz = buf.readUInt16BE(offset + bytes);
    bytes += 2;

    if (clazz !== con.CLASS_IN) {
      callback('Unexpected resource record class [' + clazz +
               '] for name [' + record.name + ']; expected class [' +
               CLASS_IN + '].');
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
    callback('RData section of type [A] for name [' + record.name +
             '] is unexpected length [' + length + ']; expected [4].');
    return;
  }

  var bytes = 0;

  var address = inetToString(buf.readUInt32BE(offset + bytes));
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
      callback('Unexpected NS record name length for record [' +
               record.name + '].');
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
    callback('RData section of type [NULL] for name [' + record.name +
             '] is unexpected length [' + length + ']; expected [0].');
    return;
  }

  callback(null);
}

function nbRDataParser(buf, offset, length, record, callback) {
  if (length % 6 !== 0) {
    callback('RData section of type [NB] for name [' + record.name +
             '] is unexpected length [' + length +
             ']; should be multiple of [6].');
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

    entry.address = inetToString(buf.readUInt32BE(offset + bytes));
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

function inetToString(inet) {
  return ((inet >> 24) & 0x000000ff) + '.' +
         ((inet >> 16) & 0x000000ff) + '.' +
         ((inet >> 8) & 0x000000ff) + '.' +
         (inet & 0x000000ff);
}

// Unpack or parse the netbios message contained within the given buffer.
// Note, the message must start at the beginning of the buffer.
module.exports = function(buf, callback) {
  var gError = null;
  var message = Object.create(null);
  var bytes = 0;

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
    callback('Header is too large to fit in remaining packet bytes.');
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
    callback('Illegal NetBIOS opcode [' + opcode + ']');
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
    callback('Illegal NetBIOS rcode [' + rcode + ']');
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
    { len: qdcount, func: parseQuestion, arr: message.questions },
    { len: ancount, func: parseResourceRecord, arr: message.answerRecords },
    { len: nscount, func: parseResourceRecord, arr: message.authorityRecords },
    { len: arcount, func: parseResourceRecord, arr: message.additionalRecords }
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
