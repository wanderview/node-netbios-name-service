'use strict';

var Stream = require('../stream');

var net = require('net');
var path = require('path');
var pcap = require('pcap-parser');

var unpack = require('../unpack');

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
          socket.destroy();
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
        client.destroy();
      });
    });
  });
};
