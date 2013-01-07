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

var Stream = require('../lib/stream');

var net = require('net');
var path = require('path');
var pcap = require('pcap-parser');

var unpack = require('../lib/unpack');

// TODO: refactor helpers out to be more DRY

// Crude, but quick calculations to get start of NetBIOS data from pcap packet.
var ETHER_FRAME_LEN = 14;
var IP_HEADER_LEN = 20;
var UDP_HEADER_LEN = 8;
var UDP_PAYLOAD_OFFSET = ETHER_FRAME_LEN + IP_HEADER_LEN + UDP_HEADER_LEN;

// Helper routine that reads a NetBIOS message in from a pcap file and then
// calls netbios.unpack() on the resulting buffer.
function pcapUnpack(file, callback) {
  var parser = pcap.parse(path.join(__dirname, 'data', file));
  parser.on('packetData', function(buf) {
    var udpPayload = buf.slice(UDP_PAYLOAD_OFFSET);
    unpack(udpPayload, function(error, mLen, msg) {
      callback(error, mLen, msg);
    });
  });
}

// TODO; improve test case to handle multiple messages, check for errors, etc.

module.exports.testStream = function(test) {
  test.expect(1);
  var server = net.createServer();
  server.listen(0, '127.0.0.1', 511, function() {
    var port = server.address()['port'];

    server.on('connection', function(socket) {
      var serverStream = new Stream(socket);
      serverStream.on('message', function(msg) {
        test.ok(true);
        server.close(function() {
          serverStream.destroy();
          test.done();
        });
      });
      serverStream.start();
    });

    var client = new net.Socket();
    client.connect(port, '127.0.0.1', function() {
      var clientStream = new Stream(client);

      pcapUnpack('netbios-ns-b-query-winxp.pcap', function(error, len, msg) {
        clientStream.write(msg);
        clientStream.destroy();
      });
    });
  });
};
