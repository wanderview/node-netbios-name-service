"use strict";

var ns = require('../lib/netbios-ns')
var pcap = require('pcap-parser');
var path = require('path');

// TODO: do a better job of testing name compression; include pointers, etc

//
// Helper routines
//

// Crude, but quick calculations to get start of NetBIOS data from pcap packet.
var ETHER_FRAME_LEN = 14;
var IP_HEADER_LEN = 20;
var UDP_HEADER_LEN = 8;
var UDP_PAYLOAD_OFFSET = ETHER_FRAME_LEN + IP_HEADER_LEN + UDP_HEADER_LEN;

// Helper routine that reads a NetBIOS message in from a pcap file and then
// calls netbios.unpack() on the resulting buffer.
function testPcap(test, file, callback) {

  // Load the packet data from the PCAP file
  var parser = pcap.parse(path.join(__dirname, 'data', file));
  parser.on('packetData', function(buf) {

    // Examine only the message contents; skip the IP/UDP header
    var udpPayload = buf.slice(UDP_PAYLOAD_OFFSET);

    // Parse the contents of the message
    ns.unpack(udpPayload, function(error, mLen, msg) {
      test.equal(error, null, 'unpack got error [' + error + ']');

      // Re-pack the message back into a network buffer
      var buf = new Buffer(mLen);
      ns.pack(buf, msg, function(error, packedLen) {
        test.equal(error, null, 'pack got error [' + error + ']');

        // verify re-packed message exactly matches original buffer
        for (var i = 0; i < udpPayload.length && i < buf.length && i < packedLen; ++i) {
          test.equal(buf[i], udpPayload[i], 'Buffer byte at index [' + i + ']');
        }

        callback();
      });
    });
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
