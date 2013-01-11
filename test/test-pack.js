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

var pack = require('../lib/pack');
var unpack = require('../lib/unpack');
var pcapUnpack = require('./helpers/pcap-unpack');

//
// Helper routines
//

// Helper routine that reads a NetBIOS message in from a pcap file and then
// calls netbios.unpack() on the resulting buffer.
function testPcap(test, file, callback) {

  // Load the packet data from the PCAP file
  var parser = pcapUnpack(file, function(error, len, msg, udpPayload) {

    // Parse the contents of the message
    test.equal(error, null, 'unpack got error [' + error + ']');

    // Re-pack the message back into a network buffer
    var buf = new Buffer(len);
    var res = pack(buf, msg);
    test.equal(res.error, null, 'pack got error [' + res.error + ']');

    // verify re-packed message exactly matches original buffer
    for (var i = 0; i < udpPayload.length && i < buf.length &&
                    i < res.bytesWritten; ++i) {
      test.equal(buf[i], udpPayload[i], 'Buffer byte at index [' + i + ']');
    }

    callback();
  });
}

//
// Test routines
//

module.exports.testPackQuery = function(test) {
  test.expect(52);
  testPcap(test, 'netbios-ns-b-query-winxp.pcap', function() {
    test.done();
  });
}

module.exports.testPackPositiveResponse = function(test) {
  test.expect(64);
  testPcap(test, 'netbios-ns-b-positive-response-winxp.pcap', function() {
    test.done();
  });
}

module.exports.testPackRegistration = function(test) {
  test.expect(70);
  testPcap(test, 'netbios-ns-b-register-winxp.pcap', function() {
    test.done();
  });
}

module.exports.testPackRegistrationNegativeResponse = function(test) {
  test.expect(76);
  testPcap(test, 'netbios-ns-b-register-negative-response-winxp.pcap', function() {
    test.done();
  });
}

module.exports.testPackNbstat = function(test) {
  test.expect(52);
  testPcap(test, 'netbios-ns-b-nbstat-winxp.pcap', function() {
    test.done();
  });
}

module.exports.testPackNbstatResponse = function(test) {
  test.expect(213);
  testPcap(test, 'netbios-ns-b-nbstat-response-winxp.pcap', function() {
    test.done();
  });
}
